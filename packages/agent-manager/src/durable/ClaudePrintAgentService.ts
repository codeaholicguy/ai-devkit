import type { DurableAgent, ProcessIdentity } from './DurableAgent.js';
import { ClaudePrintError, DurableAgentNotFoundError } from './DurableAgent.js';
import { ClaudeCliProbe } from './ClaudeCliProbe.js';
import { ClaudePrintRunner, type ClaudePrintRunResult } from './ClaudePrintRunner.js';
import { DurableAgentRepository, type CreateDurableAgentInput, type DurableRunCompletion } from './DurableAgentRepository.js';

interface RepositoryLike {
    create(input: CreateDurableAgentInput): Promise<DurableAgent>;
    list(): Promise<DurableAgent[]>;
    resolve(reference: string): Promise<DurableAgent | DurableAgent[] | null>;
    acquireRun(id: string): Promise<{ agent: DurableAgent; token: string }>;
    recordProviderProcess(id: string, token: string, identity: ProcessIdentity): Promise<void>;
    completeRun(id: string, token: string, result: DurableRunCompletion): Promise<DurableAgent>;
}

interface ProbeLike { validate(): Promise<{ executable: string; version: string }> }
interface RunnerLike { run(request: Parameters<ClaudePrintRunner['run']>[0]): Promise<ClaudePrintRunResult> }

export interface ClaudePrintAgentServiceOptions {
    repository?: RepositoryLike;
    probe?: ProbeLike;
    runner?: RunnerLike;
    executable?: string;
}

export interface ClaudePrintSendResult extends ClaudePrintRunResult {
    agentId: string;
    agentName: string;
}

export class ClaudePrintAgentService {
    readonly repository: RepositoryLike;
    private readonly probe: ProbeLike;
    private readonly runner: RunnerLike;
    private readonly executable?: string;

    constructor(options: ClaudePrintAgentServiceOptions = {}) {
        this.repository = options.repository ?? new DurableAgentRepository();
        this.probe = options.probe ?? new ClaudeCliProbe();
        this.runner = options.runner ?? new ClaudePrintRunner();
        this.executable = options.executable;
    }

    async create(input: CreateDurableAgentInput): Promise<DurableAgent> {
        await this.probe.validate();
        return this.repository.create(input);
    }

    async send(reference: string, prompt: string): Promise<ClaudePrintSendResult> {
        const resolved = await this.repository.resolve(reference);
        if (!resolved) throw new DurableAgentNotFoundError(reference);
        if (Array.isArray(resolved)) {
            throw new ClaudePrintError(`Multiple durable agents match "${reference}".`, 'DURABLE_AGENT_AMBIGUOUS');
        }
        const acquired = await this.repository.acquireRun(resolved.id);
        try {
            if (acquired.agent.provider !== 'claude') {
                throw new ClaudePrintError('Durable agent provider is not Claude.', 'CLAUDE_PRINT_UNSUPPORTED');
            }
            const result = await this.runner.run({
                agent: acquired.agent,
                prompt,
                executable: this.executable,
                firstRun: acquired.agent.sessionHealth === 'uninitialized',
                onSpawn: (identity) => this.repository.recordProviderProcess(resolved.id, acquired.token, identity),
            });
            await this.repository.completeRun(resolved.id, acquired.token, {
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
            await this.repository.completeRun(resolved.id, acquired.token, {
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
