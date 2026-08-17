import type { DurableAgent, ProcessIdentity } from '../../../durable/DurableAgent.js';
import { DurableAgentNotFoundError, PiPrintError } from '../../../durable/DurableAgent.js';
import { PiCliProbe } from './PiCliProbe.js';
import { PiPrintRunner, type PiPrintRunResult } from './PiPrintRunner.js';
import { DurableAgentRepository, type CreateDurableAgentInput, type DurableRunCompletion } from '../../../durable/DurableAgentRepository.js';

interface RepositoryLike { create(input: CreateDurableAgentInput): Promise<DurableAgent>; list(): Promise<DurableAgent[]>; resolve(reference: string): Promise<DurableAgent | DurableAgent[] | null>; acquireRun(id: string): Promise<{ agent: DurableAgent; token: string }>; recordProviderProcess(id: string, token: string, identity: ProcessIdentity): Promise<void>; completeRun(id: string, token: string, result: DurableRunCompletion): Promise<DurableAgent> }
interface ProbeLike { validate(): Promise<{ executable: string; version: string }> }
interface RunnerLike { run(request: Parameters<PiPrintRunner['run']>[0]): Promise<PiPrintRunResult> }
export interface PiPrintAgentServiceOptions { repository?: RepositoryLike; probe?: ProbeLike; runner?: RunnerLike; executable?: string }
export interface PiPrintSendResult extends PiPrintRunResult { agentId: string; agentName: string }

export class PiPrintAgentService {
    readonly repository: RepositoryLike; private readonly probe: ProbeLike; private readonly runner: RunnerLike; private readonly executable?: string;
    constructor(options: PiPrintAgentServiceOptions = {}) {
        this.repository = options.repository ?? new DurableAgentRepository(); this.probe = options.probe ?? new PiCliProbe();
        this.runner = options.runner ?? new PiPrintRunner(); this.executable = options.executable;
    }
    async create(input: Omit<CreateDurableAgentInput, 'provider'>): Promise<DurableAgent> {
        await this.probe.validate(); return this.repository.create({ ...input, provider: 'pi' });
    }
    async send(reference: string, prompt: string): Promise<PiPrintSendResult> {
        const resolved = await this.repository.resolve(reference);
        if (!resolved) throw new DurableAgentNotFoundError(reference);
        if (Array.isArray(resolved)) throw new PiPrintError('Multiple print agents match.', 'PI_UNSUPPORTED');
        const acquired = await this.repository.acquireRun(resolved.id);
        try {
            if (acquired.agent.provider !== 'pi') throw new PiPrintError('Print agent provider is not Pi.', 'PI_UNSUPPORTED');
            const result = await this.runner.run({ agent: acquired.agent, prompt, executable: this.executable,
                onSpawn: (identity) => this.repository.recordProviderProcess(resolved.id, acquired.token, identity) });
            await this.repository.completeRun(resolved.id, acquired.token, { status: 'succeeded', exitCode: result.exitCode,
                summary: sanitize(result.result, 4096), sessionHealth: 'healthy' });
            return { ...result, agentId: resolved.id, agentName: resolved.name };
        } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error));
            const mismatch = error instanceof PiPrintError && error.code === 'PI_SESSION_MISMATCH';
            await this.repository.completeRun(resolved.id, acquired.token, { status: 'failed', exitCode: null,
                summary: sanitize(failure.message, 4096), sessionHealth: mismatch ? 'mismatch' : 'unknown' });
            throw error;
        }
    }
}

function sanitize(value: string, max: number): string {
    return Array.from(value, (character) => { const code = character.charCodeAt(0); return (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) ? ' ' : character; }).join('').trim().slice(0, max);
}
