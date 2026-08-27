import type { DurableAgent, ProcessIdentity } from '../../../durable/DurableAgent.js';
import { ClaudePrintError } from '../../../durable/DurableAgent.js';
import { ClaudeCliProbe } from './ClaudeCliProbe.js';
import { ClaudePrintRunner, type ClaudePrintRunResult } from './ClaudePrintRunner.js';
import { DurableAgentRepository, type CreateDurableAgentInput } from '../../../durable/DurableAgentRepository.js';
import { runDurableAgent, type DurableRunRepository } from '../../../durable/run.js';

interface RepositoryLike extends DurableRunRepository {
    create(input: CreateDurableAgentInput): Promise<DurableAgent>;
    list(): Promise<DurableAgent[]>;
    recordProviderProcess(id: string, token: string, identity: ProcessIdentity): Promise<void>;
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
        const completed = await runDurableAgent({
            reference, provider: 'claude', repository: this.repository,
            ambiguousError: () => new ClaudePrintError(
                `Multiple durable agents match "${reference}".`, 'DURABLE_AGENT_AMBIGUOUS'),
            providerError: () => new ClaudePrintError(
                'Durable agent provider is not Claude.', 'CLAUDE_PRINT_UNSUPPORTED'),
            execute: (agent, token) => this.runner.run({
                agent,
                prompt,
                executable: this.executable,
                firstRun: agent.sessionHealth === 'uninitialized',
                onSpawn: (identity) => this.repository.recordProviderProcess(agent.id, token, identity),
            }),
            isSessionMismatch: (error) => error instanceof ClaudePrintError
                && error.code === 'CLAUDE_SESSION_MISMATCH',
        });
        return { ...completed.result, agentId: completed.agent.id, agentName: completed.agent.name };
    }
}
