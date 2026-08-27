import type { DurableAgent, DurableProvider } from './DurableAgent.js';
import { DurableAgentNotFoundError } from './DurableAgent.js';
import type { DurableRunCompletion } from './DurableAgentRepository.js';
import { sanitizeText } from './utils.js';

const MAX_RESULT_SUMMARY_LENGTH = 4096;

export interface DurableRunRepository {
    resolve(reference: string): Promise<DurableAgent | DurableAgent[] | null>;
    acquireRun(id: string): Promise<{ agent: DurableAgent; token: string }>;
    completeRun(id: string, token: string, result: DurableRunCompletion): Promise<DurableAgent>;
}

type ProviderAgent<Provider extends DurableProvider> = Extract<DurableAgent, { provider: Provider }>;

interface DurableRunResult {
    result: string;
    exitCode: number;
}

interface DurableRunOptions<Provider extends DurableProvider, Result extends DurableRunResult> {
    reference: string;
    provider: Provider;
    repository: DurableRunRepository;
    ambiguousError(): Error;
    providerError(): Error;
    execute(agent: ProviderAgent<Provider>, token: string): Promise<Result>;
    isSessionMismatch(error: unknown): boolean;
}

export async function runDurableAgent<Provider extends DurableProvider, Result extends DurableRunResult>(
    options: DurableRunOptions<Provider, Result>,
): Promise<{ agent: ProviderAgent<Provider>; result: Result }> {
    const resolved = await options.repository.resolve(options.reference);
    if (!resolved) throw new DurableAgentNotFoundError(options.reference);
    if (Array.isArray(resolved)) throw options.ambiguousError();
    if (resolved.provider !== options.provider) throw options.providerError();

    const target = resolved as ProviderAgent<Provider>;
    const acquired = await options.repository.acquireRun(target.id);
    let result: Result;
    try {
        result = await options.execute(acquired.agent as ProviderAgent<Provider>, acquired.token);
    } catch (error) {
        await options.repository.completeRun(
            target.id,
            acquired.token,
            createFailedCompletion(error, options.isSessionMismatch(error)),
        );
        throw error;
    }

    await options.repository.completeRun(target.id, acquired.token, createSucceededCompletion(result));
    return { agent: target, result };
}

function createSucceededCompletion(result: DurableRunResult): DurableRunCompletion {
    return {
        status: 'succeeded',
        exitCode: result.exitCode,
        summary: sanitizeText(result.result, MAX_RESULT_SUMMARY_LENGTH, { preserveFormatting: true }),
        sessionHealth: 'healthy',
    };
}

function createFailedCompletion(error: unknown, sessionMismatch: boolean): DurableRunCompletion {
    const message = error instanceof Error ? error.message : String(error);
    return {
        status: 'failed',
        exitCode: null,
        summary: sanitizeText(message, MAX_RESULT_SUMMARY_LENGTH, { preserveFormatting: true }),
        sessionHealth: sessionMismatch ? 'mismatch' : 'unknown',
    };
}
