import type { PrintAgent, ProcessIdentity } from './PrintAgent.js';
import { ClaudePrintError, PrintAgentNotFoundError } from './PrintAgent.js';
import { ClaudeCliProbe } from './ClaudeCliProbe.js';
import { ClaudePrintRunner, type ClaudePrintRunResult } from './ClaudePrintRunner.js';
import { PrintAgentStore, type CreatePrintAgentInput, type PrintRunCompletion } from './PrintAgentStore.js';

interface StoreLike {
    create(input: CreatePrintAgentInput): Promise<PrintAgent>;
    list(): Promise<PrintAgent[]>;
    resolve(reference: string): Promise<PrintAgent | PrintAgent[] | null>;
    acquireRun(id: string): Promise<{ agent: PrintAgent; token: string }>;
    recordProviderProcess(id: string, token: string, identity: ProcessIdentity): Promise<void>;
    completeRun(id: string, token: string, result: PrintRunCompletion): Promise<PrintAgent>;
}

interface ProbeLike { validate(): Promise<{ executable: string; version: string }> }
interface RunnerLike { run(request: Parameters<ClaudePrintRunner['run']>[0]): Promise<ClaudePrintRunResult> }

export interface ClaudePrintAgentServiceOptions {
    store?: StoreLike;
    probe?: ProbeLike;
    runner?: RunnerLike;
    executable?: string;
}

export interface ClaudePrintSendResult extends ClaudePrintRunResult {
    agentId: string;
    agentName: string;
}

export class ClaudePrintAgentService {
    readonly store: StoreLike;
    private readonly probe: ProbeLike;
    private readonly runner: RunnerLike;
    private readonly executable?: string;

    constructor(options: ClaudePrintAgentServiceOptions = {}) {
        this.store = options.store ?? new PrintAgentStore();
        this.probe = options.probe ?? new ClaudeCliProbe();
        this.runner = options.runner ?? new ClaudePrintRunner();
        this.executable = options.executable;
    }

    async create(input: CreatePrintAgentInput): Promise<PrintAgent> {
        await this.probe.validate();
        return this.store.create(input);
    }

    async send(reference: string, prompt: string): Promise<ClaudePrintSendResult> {
        const resolved = await this.store.resolve(reference);
        if (!resolved) throw new PrintAgentNotFoundError(reference);
        if (Array.isArray(resolved)) {
            throw new ClaudePrintError(`Multiple print agents match "${reference}".`, 'PRINT_AGENT_AMBIGUOUS');
        }
        const acquired = await this.store.acquireRun(resolved.id);
        try {
            const result = await this.runner.run({
                agent: acquired.agent,
                prompt,
                executable: this.executable,
                firstRun: acquired.agent.sessionHealth === 'uninitialized',
                onSpawn: (identity) => this.store.recordProviderProcess(resolved.id, acquired.token, identity),
            });
            await this.store.completeRun(resolved.id, acquired.token, {
                status: 'succeeded',
                exitCode: result.exitCode,
                summary: sanitize(result.result, 4096),
                sessionHealth: 'healthy',
            });
            return { ...result, agentId: resolved.id, agentName: resolved.name };
        } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error));
            const sessionHealth = error instanceof ClaudePrintError && error.code === 'CLAUDE_SESSION_MISMATCH'
                ? 'mismatch' as const
                : 'unknown' as const;
            await this.store.completeRun(resolved.id, acquired.token, {
                status: 'failed',
                exitCode: null,
                summary: sanitize(failure.message, 4096),
                sessionHealth,
            });
            throw error;
        }
    }
}

function sanitize(value: string, max: number): string {
    return Array.from(value, (character) => {
        const code = character.charCodeAt(0);
        return (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127)
            ? ' '
            : character;
    }).join('').trim().slice(0, max);
}
