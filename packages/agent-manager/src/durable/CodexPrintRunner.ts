import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'child_process';
import type { CodexDurableAgent, ProcessIdentity } from './DurableAgent.js';
import { CodexPrintError } from './DurableAgent.js';
import { LocalProcessInspector, type ProcessInspector } from './DurableAgentRepository.js';

type Spawn = (
    command: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio & { stdio: ['pipe', 'pipe', 'pipe'] },
) => ChildProcessWithoutNullStreams;

export interface CodexPrintRunRequest {
    agent: CodexDurableAgent;
    prompt: string;
    executable?: string;
    onSpawn(identity: ProcessIdentity): Promise<void>;
    onSession(providerSessionId: string): Promise<void>;
}

export interface CodexPrintRunResult {
    sessionId: string;
    result: string;
    messages: string[];
    exitCode: number;
}

export interface CodexPrintRunnerOptions {
    spawn?: Spawn;
    processInspector?: ProcessInspector;
    maxLineBytes?: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CodexPrintRunner {
    private readonly spawn: Spawn;
    private readonly processInspector: ProcessInspector;
    private readonly maxLineBytes: number;

    constructor(options: CodexPrintRunnerOptions = {}) {
        this.spawn = options.spawn ?? (nodeSpawn as Spawn);
        this.processInspector = options.processInspector ?? new LocalProcessInspector();
        this.maxLineBytes = options.maxLineBytes ?? 1024 * 1024;
    }

    async run(request: CodexPrintRunRequest): Promise<CodexPrintRunResult> {
        const args = request.agent.providerSessionId === null
            ? ['exec', '--json', '-']
            : ['exec', 'resume', '--json', request.agent.providerSessionId, '-'];
        const child = this.spawn(request.executable ?? 'codex', args, {
            cwd: request.agent.cwd, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
        });
        if (!child.pid) {
            child.kill();
            throw new CodexPrintError('Codex process did not provide a PID.', 'CODEX_PROCESS');
        }
        const identity = this.processInspector.getIdentity(child.pid);
        if (!identity) {
            child.kill();
            throw new CodexPrintError('Cannot verify Codex process identity.', 'CODEX_PROCESS');
        }

        let buffer = Buffer.alloc(0);
        let sessionId: string | null = null;
        let turnCompleted = false;
        const messages: string[] = [];
        let protocolError: CodexPrintError | null = null;
        let processing = Promise.resolve();

        const processLine = async (line: Buffer): Promise<void> => {
            if (protocolError || line.length === 0) return;
            if (line.length > this.maxLineBytes) {
                throw new CodexPrintError('Codex stream line exceeded the safety limit.', 'CODEX_PROTOCOL');
            }
            let value: unknown;
            try { value = JSON.parse(line.toString('utf8')); } catch {
                throw new CodexPrintError('Codex emitted malformed stream JSON.', 'CODEX_PROTOCOL');
            }
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                throw new CodexPrintError('Codex emitted a non-object stream message.', 'CODEX_PROTOCOL');
            }
            const event = value as Record<string, unknown>;
            if (event.type === 'thread.started') {
                if (sessionId !== null || !UUID_PATTERN.test(String(event.thread_id ?? ''))) {
                    throw new CodexPrintError('Codex emitted an invalid thread identity.', 'CODEX_PROTOCOL');
                }
                sessionId = event.thread_id as string;
                if (request.agent.providerSessionId !== null && request.agent.providerSessionId !== sessionId) {
                    throw new CodexPrintError('Codex returned a different session identity.', 'CODEX_SESSION_MISMATCH');
                }
                await request.onSession(sessionId);
            } else if (event.type === 'item.completed') {
                const item = event.item;
                if (item && typeof item === 'object' && !Array.isArray(item)) {
                    const record = item as Record<string, unknown>;
                    if (record.type === 'agent_message' && typeof record.text === 'string' && record.text.trim()) {
                        messages.push(record.text);
                    }
                }
            } else if (event.type === 'turn.completed') {
                turnCompleted = true;
            }
        };

        child.stdout.on('data', (chunk: Buffer | string) => {
            if (protocolError) return;
            buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
            if (buffer.length > this.maxLineBytes && buffer.indexOf(0x0a) < 0) {
                protocolError = new CodexPrintError('Codex stream line exceeded the safety limit.', 'CODEX_PROTOCOL');
                return;
            }
            let newline: number;
            while ((newline = buffer.indexOf(0x0a)) >= 0) {
                const line = buffer.subarray(0, newline);
                buffer = buffer.subarray(newline + 1);
                processing = processing.then(() => processLine(line)).catch((error) => {
                    protocolError = error instanceof CodexPrintError
                        ? error
                        : new CodexPrintError('Codex stream processing failed.', 'CODEX_PROTOCOL');
                });
            }
        });
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
        await processing;

        if (protocolError) throw protocolError;
        if (buffer.length > 0) throw new CodexPrintError('Codex stream ended with incomplete JSON.', 'CODEX_PROTOCOL');
        if (code !== 0) {
            throw new CodexPrintError(`Codex print run failed${signal ? ` (${signal})` : '.'}`, 'CODEX_PROCESS');
        }
        if (sessionId === null) throw new CodexPrintError('Codex stream ended without a thread identity.', 'CODEX_PROTOCOL');
        if (!turnCompleted) throw new CodexPrintError('Codex stream ended before turn completion.', 'CODEX_PROTOCOL');
        if (messages.length === 0) throw new CodexPrintError('Codex stream ended without an assistant result.', 'CODEX_RESULT_MISSING');
        return { sessionId, result: messages.at(-1)!, messages, exitCode: code };
    }
}
