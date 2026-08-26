import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'child_process';
import type { ClaudeDurableAgent, ProcessIdentity } from '../../../durable/DurableAgent.js';
import { ClaudePrintError } from '../../../durable/DurableAgent.js';
import { LocalProcessInspector, type ProcessInspector } from '../../../durable/process.js';
import { waitForChildClose } from '../../../durable/utils.js';
import { ClaudeStreamParser } from './ClaudeStreamParser.js';

type Spawn = (
    command: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio & { stdio: ['pipe', 'pipe', 'pipe'] },
) => ChildProcessWithoutNullStreams;

export interface ClaudePrintRunRequest {
    agent: ClaudeDurableAgent;
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

        const parser = new ClaudeStreamParser(request.agent.providerSessionId, this.maxLineBytes);

        child.stdout.on('data', (chunk: Buffer | string) => {
            if (parser.hasFailed()) return;
            try {
                parser.accept(chunk);
            } catch (error) {
                parser.fail(error);
            }
        });
        // Drain provider diagnostics without reflecting potentially sensitive prompt/tool data.
        child.stderr.resume();

        const closed = waitForChildClose(child);

        try {
            await request.onSpawn(identity);
        } catch (error) {
            child.kill();
            throw error;
        }

        child.stdin.end(request.prompt);
        const { code, signal } = await closed;

        return parser.result({ code, signal });
    }
}
