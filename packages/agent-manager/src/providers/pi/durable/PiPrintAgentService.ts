import type { DurableAgent, ProcessIdentity } from '../../../durable/DurableAgent.js';
import { PiPrintError } from '../../../durable/DurableAgent.js';
import { PiCliProbe } from './PiCliProbe.js';
import { PiPrintRunner, type PiPrintRunResult } from './PiPrintRunner.js';
import { DurableAgentRepository, type CreateDurableAgentInput } from '../../../durable/DurableAgentRepository.js';
import { runDurableAgent, type DurableRunRepository } from '../../../durable/run.js';

interface RepositoryLike extends DurableRunRepository {
    create(input: CreateDurableAgentInput): Promise<DurableAgent>;
    list(): Promise<DurableAgent[]>;
    recordProviderProcess(id: string, token: string, identity: ProcessIdentity): Promise<void>;
}

interface ProbeLike { validate(): Promise<{ executable: string; version: string }> }
interface RunnerLike { run(request: Parameters<PiPrintRunner['run']>[0]): Promise<PiPrintRunResult> }

export interface PiPrintAgentServiceOptions {
    repository?: RepositoryLike;
    probe?: ProbeLike;
    runner?: RunnerLike;
    executable?: string;
}

export interface PiPrintSendResult extends PiPrintRunResult {
    agentId: string;
    agentName: string;
}

export class PiPrintAgentService {
    readonly repository: RepositoryLike;
    private readonly probe: ProbeLike;
    private readonly runner: RunnerLike;
    private readonly executable?: string;

    constructor(options: PiPrintAgentServiceOptions = {}) {
        this.repository = options.repository ?? new DurableAgentRepository();
        this.probe = options.probe ?? new PiCliProbe();
        this.runner = options.runner ?? new PiPrintRunner();
        this.executable = options.executable;
    }

    async create(input: Omit<CreateDurableAgentInput, 'provider'>): Promise<DurableAgent> {
        await this.probe.validate();
        return this.repository.create({ ...input, provider: 'pi' });
    }

    async send(reference: string, prompt: string): Promise<PiPrintSendResult> {
        const completed = await runDurableAgent({
            reference,
            provider: 'pi',
            repository: this.repository,
            ambiguousError: () => new PiPrintError('Multiple print agents match.', 'PI_UNSUPPORTED'),
            providerError: () => new PiPrintError('Print agent provider is not Pi.', 'PI_UNSUPPORTED'),
            execute: (agent, token) => this.runner.run({
                agent,
                prompt,
                executable: this.executable,
                onSpawn: (identity) => this.repository.recordProviderProcess(agent.id, token, identity),
            }),
            isSessionMismatch: (error) => error instanceof PiPrintError
                && error.code === 'PI_SESSION_MISMATCH',
        });
        return {
            ...completed.result,
            agentId: completed.agent.id,
            agentName: completed.agent.name,
        };
    }
}
