import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'child_process';
import type { DurableAgent, ProcessIdentity } from '../../../durable/DurableAgent.js';
import { ClaudePrintError } from '../../../durable/DurableAgent.js';
import { LocalProcessInspector, type ProcessInspector } from '../../../durable/DurableAgentRepository.js';

type Spawn = (
    command: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio & { stdio: ['pipe', 'pipe', 'pipe'] },
) => ChildProcessWithoutNullStreams;

export interface ClaudePrintRunRequest {
    agent: DurableAgent;
    prompt: string;
    executable?: string;
    firstRun: boolean;
    onSpawn(identity: ProcessIdentity): Promise<void>;
}

export interface ClaudePrintRunResult {
    sessionId: string;
    result: string;
    exitCode: number;
}

export interface ClaudePrintRunnerOptions {
    spawn?: Spawn;
    processInspector?: ProcessInspector;
    maxLineBytes?: number;
}

export class ClaudePrintRunner {
    private readonly spawn: Spawn;
    private readonly processInspector: ProcessInspector;
    private readonly maxLineBytes: number;

    constructor(options: ClaudePrintRunnerOptions = {}) {
        this.spawn = options.spawn ?? (nodeSpawn as Spawn);
        this.processInspector = options.processInspector ?? new LocalProcessInspector();
        this.maxLineBytes = options.maxLineBytes ?? 1024 * 1024;
    }

    async run(request: ClaudePrintRunRequest): Promise<ClaudePrintRunResult> {
        const sessionArgs = request.firstRun
            ? ['--session-id', request.agent.providerSessionId]
            : ['--resume', request.agent.providerSessionId];
        const args = ['-p', ...sessionArgs, '--output-format', 'stream-json', '--verbose'];
        const child = this.spawn(request.executable ?? 'claude', args, {
            cwd: request.agent.cwd,
            shell: false,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        if (!child.pid) {
            child.kill();
            throw new ClaudePrintError('Claude process did not provide a PID.', 'CLAUDE_PROCESS_IDENTITY');
        }
        const identity = this.processInspector.getIdentity(child.pid);
        if (!identity) {
            child.kill();
            throw new ClaudePrintError('Cannot verify Claude process identity.', 'CLAUDE_PROCESS_IDENTITY');
        }

        let buffer = Buffer.alloc(0);
        let terminal: ClaudePrintRunResult | null = null;
        let protocolError: ClaudePrintError | null = null;

        child.stdout.on('data', (chunk: Buffer | string) => {
            if (protocolError) return;
            buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
            if (buffer.length > this.maxLineBytes && buffer.indexOf(0x0a) < 0) {
                protocolError = new ClaudePrintError('Claude stream line exceeded the safety limit.', 'CLAUDE_STREAM_OVERSIZED');
                return;
            }
            let newline: number;
            while ((newline = buffer.indexOf(0x0a)) >= 0) {
                const line = buffer.subarray(0, newline);
                buffer = buffer.subarray(newline + 1);
                if (line.length === 0) continue;
                if (line.length > this.maxLineBytes) {
                    protocolError = new ClaudePrintError('Claude stream line exceeded the safety limit.', 'CLAUDE_STREAM_OVERSIZED');
                    return;
                }
                try {
                    const value = JSON.parse(line.toString('utf8')) as unknown;
                    if (!value || typeof value !== 'object' || Array.isArray(value)) {
                        throw new ClaudePrintError('Claude emitted a non-object stream message.', 'CLAUDE_STREAM_INVALID');
                    }
                    const event = value as Record<string, unknown>;
                    if (typeof event.session_id === 'string' && event.session_id !== request.agent.providerSessionId) {
                        throw new ClaudePrintError('Claude returned a different session identity.', 'CLAUDE_SESSION_MISMATCH');
                    }
                    if (event.type === 'result') {
                        if (terminal) throw new ClaudePrintError('Claude emitted more than one terminal result.', 'CLAUDE_STREAM_INVALID');
                        if (typeof event.session_id !== 'string' || typeof event.result !== 'string') {
                            throw new ClaudePrintError('Claude emitted an invalid terminal result.', 'CLAUDE_STREAM_INVALID');
                        }
                        terminal = { sessionId: event.session_id, result: event.result, exitCode: 0 };
                    }
                } catch (error) {
                    protocolError = error instanceof ClaudePrintError
                        ? error
                        : new ClaudePrintError('Claude emitted malformed stream JSON.', 'CLAUDE_STREAM_INVALID');
                    return;
                }
            }
        });
        // Drain provider diagnostics without reflecting potentially sensitive prompt/tool data.
        child.stderr.resume();

        const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
            child.once('error', reject);
            child.once('close', (code, signal) => resolve({ code, signal }));
        });

        try {
            await request.onSpawn(identity);
        } catch (error) {
            child.kill();
            throw error;
        }

        child.stdin.end(request.prompt);
        const { code, signal } = await closed;

        if (protocolError) throw protocolError;
        if (buffer.length > 0) {
            throw new ClaudePrintError('Claude stream ended with incomplete JSON.', 'CLAUDE_STREAM_INVALID');
        }
        if (code !== 0) {
            throw new ClaudePrintError(
                `Claude print run failed${signal ? ` (${signal})` : '.'}`,
                'CLAUDE_PROCESS_FAILED',
            );
        }
        if (!terminal) throw new ClaudePrintError('Claude stream ended without a terminal result.', 'CLAUDE_RESULT_MISSING');
        const finalResult = terminal as ClaudePrintRunResult;
        return { sessionId: finalResult.sessionId, result: finalResult.result, exitCode: code };
    }
}
