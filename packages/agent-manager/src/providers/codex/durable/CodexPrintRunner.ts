import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'child_process';
import type { CodexDurableAgent, ProcessIdentity } from '../../../durable/DurableAgent.js';
import { CodexPrintError } from '../../../durable/DurableAgent.js';
import { LocalProcessInspector, type ProcessInspector } from '../../../durable/process.js';
import { waitForChildClose } from '../../../durable/utils.js';
import { CodexStreamParser } from './CodexStreamParser.js';

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
        const args = buildCodexExecArgs(request.agent);
        const child = this.spawn(request.executable ?? 'codex', args, {
            cwd: request.agent.cwd, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
        });
        const identity = this.verifyProcessIdentity(child);

        const parser = new CodexStreamParser(request.agent.providerSessionId, request.onSession, this.maxLineBytes);
        let processing = Promise.resolve();

        child.stdout.on('data', (chunk: Buffer | string) => {
            if (parser.hasFailed()) return;
            processing = processing.then(() => parser.accept(chunk)).catch((error) => parser.fail(error));
        });
        child.stderr.resume();
        const closed = waitForChildClose(child);
        try {
            await request.onSpawn(identity);
        } catch (error) {
            child.kill();
            throw error;
        }
        child.stdin.end(request.prompt);
        const { code, signal } = await closed.catch(() => {
            throw new CodexPrintError('Codex process failed to start or communicate.', 'CODEX_PROCESS');
        });
        await processing;
        return parser.result({ code, signal });
    }

    private verifyProcessIdentity(child: ChildProcessWithoutNullStreams): ProcessIdentity {
        if (!child.pid) {
            child.kill();
            throw new CodexPrintError('Codex process did not provide a PID.', 'CODEX_PROCESS');
        }
        const identity = this.processInspector.getIdentity(child.pid);
        if (!identity) {
            child.kill();
            throw new CodexPrintError('Cannot verify Codex process identity.', 'CODEX_PROCESS');
        }
        return identity;
    }
}

function buildCodexExecArgs(agent: CodexDurableAgent): string[] {
    return agent.providerSessionId === null
        ? ['exec', '--json', '-']
        : ['exec', 'resume', '--json', agent.providerSessionId, '-'];
}
