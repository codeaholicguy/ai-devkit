import type { CodexDurableAgent, DurableAgent, ProcessIdentity } from './DurableAgent.js';
import { CodexPrintError, DurableAgentNotFoundError } from './DurableAgent.js';
import { CodexCliProbe } from './CodexCliProbe.js';
import { CodexPrintRunner, type CodexPrintRunResult } from './CodexPrintRunner.js';
import { DurableAgentRepository, type CreateDurableAgentInput, type DurableRunCompletion } from './DurableAgentRepository.js';

interface RepositoryLike {
    create(input: CreateDurableAgentInput): Promise<DurableAgent>;
    resolve(reference: string): Promise<DurableAgent | DurableAgent[] | null>;
    acquireRun(id: string): Promise<{ agent: DurableAgent; token: string }>;
    recordProviderProcess(id: string, token: string, identity: ProcessIdentity): Promise<void>;
    bindProviderSession(id: string, token: string, providerSessionId: string): Promise<DurableAgent>;
    completeRun(id: string, token: string, result: DurableRunCompletion): Promise<DurableAgent>;
}

interface ProbeLike { validate(): Promise<{ executable: string; version: string }> }
interface RunnerLike { run(request: Parameters<CodexPrintRunner['run']>[0]): Promise<CodexPrintRunResult> }

export interface CodexPrintAgentServiceOptions {
    repository?: RepositoryLike;
    probe?: ProbeLike;
    runner?: RunnerLike;
    executable?: string;
}

export interface CodexPrintSendResult extends CodexPrintRunResult {
    agentId: string;
    agentName: string;
}

export class CodexPrintAgentService {
    readonly repository: RepositoryLike;
    private readonly probe: ProbeLike;
    private readonly runner: RunnerLike;
    private readonly executable?: string;

    constructor(options: CodexPrintAgentServiceOptions = {}) {
        this.repository = options.repository ?? new DurableAgentRepository();
        this.probe = options.probe ?? new CodexCliProbe();
        this.runner = options.runner ?? new CodexPrintRunner();
        this.executable = options.executable;
    }

    async create(input: Omit<CreateDurableAgentInput, 'provider'>): Promise<DurableAgent> {
        await this.probe.validate();
        return this.repository.create({ ...input, provider: 'codex' });
    }

    async send(reference: string, prompt: string): Promise<CodexPrintSendResult> {
        const resolved = await this.repository.resolve(reference);
        if (!resolved) throw new DurableAgentNotFoundError(reference);
        if (Array.isArray(resolved)) throw new CodexPrintError('Multiple print agents match.', 'CODEX_UNSUPPORTED');
        const acquired = await this.repository.acquireRun(resolved.id);
        try {
            if (acquired.agent.provider !== 'codex') {
                throw new CodexPrintError('Print agent provider is not Codex.', 'CODEX_UNSUPPORTED');
            }
            const result = await this.runner.run({
                agent: acquired.agent as CodexDurableAgent,
                prompt,
                executable: this.executable,
                onSpawn: (identity) => this.repository.recordProviderProcess(resolved.id, acquired.token, identity),
                onSession: async (sessionId) => { await this.repository.bindProviderSession(resolved.id, acquired.token, sessionId); },
            });
            await this.repository.completeRun(resolved.id, acquired.token, {
                status: 'succeeded', exitCode: result.exitCode,
                summary: sanitize(result.result, 4096), sessionHealth: 'healthy',
            });
            return { ...result, agentId: resolved.id, agentName: resolved.name };
        } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error));
            const sessionHealth = error instanceof CodexPrintError && error.code === 'CODEX_SESSION_MISMATCH'
                ? 'mismatch' as const : 'unknown' as const;
            await this.repository.completeRun(resolved.id, acquired.token, {
                status: 'failed', exitCode: null, summary: sanitize(failure.message, 4096), sessionHealth,
            });
            throw error;
        }
    }
}

function sanitize(value: string, max: number): string {
    return Array.from(value, (character) => {
        const code = character.charCodeAt(0);
        return (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127)
            ? ' ' : character;
    }).join('').trim().slice(0, max);
}
