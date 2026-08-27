import type { DurableAgent, ProcessIdentity } from '../../../durable/DurableAgent.js';
import { CodexPrintError } from '../../../durable/DurableAgent.js';
import { CodexCliProbe } from './CodexCliProbe.js';
import { CodexPrintRunner, type CodexPrintRunResult } from './CodexPrintRunner.js';
import { DurableAgentRepository, type CreateDurableAgentInput } from '../../../durable/DurableAgentRepository.js';
import { runDurableAgent, type DurableRunRepository } from '../../../durable/run.js';

interface RepositoryLike extends DurableRunRepository {
    create(input: CreateDurableAgentInput): Promise<DurableAgent>;
    list(): Promise<DurableAgent[]>;
    recordProviderProcess(id: string, token: string, identity: ProcessIdentity): Promise<void>;
    bindProviderSession(id: string, token: string, providerSessionId: string): Promise<DurableAgent>;
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
        const completed = await runDurableAgent({
            reference, provider: 'codex', repository: this.repository,
            ambiguousError: () => new CodexPrintError('Multiple print agents match.', 'CODEX_UNSUPPORTED'),
            providerError: () => new CodexPrintError('Print agent provider is not Codex.', 'CODEX_UNSUPPORTED'),
            execute: (agent, token) => this.runner.run({
                agent,
                prompt,
                executable: this.executable,
                onSpawn: (identity) => this.repository.recordProviderProcess(agent.id, token, identity),
                onSession: async (sessionId) => { await this.repository.bindProviderSession(agent.id, token, sessionId); },
            }),
            isSessionMismatch: (error) => error instanceof CodexPrintError
                && error.code === 'CODEX_SESSION_MISMATCH',
        });
        return { ...completed.result, agentId: completed.agent.id, agentName: completed.agent.name };
    }
}
