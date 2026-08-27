import type { DurableAgent, DurableProvider } from './DurableAgent.js';
import { DurableAgentNotFoundError } from './DurableAgent.js';
import type { DurableRunCompletion } from './DurableAgentRepository.js';

export interface DurableRunRepository {
    resolve(reference: string): Promise<DurableAgent | DurableAgent[] | null>;
    acquireRun(id: string): Promise<{ agent: DurableAgent; token: string }>;
    completeRun(id: string, token: string, result: DurableRunCompletion): Promise<DurableAgent>;
}

type ProviderAgent<Provider extends DurableProvider> = Extract<DurableAgent, { provider: Provider }>;

interface DurableRunOptions<Provider extends DurableProvider, Result> {
    reference: string;
    provider: Provider;
    repository: DurableRunRepository;
    ambiguousError(): Error;
    providerError(): Error;
    execute(agent: ProviderAgent<Provider>, token: string): Promise<Result>;
    succeeded(result: Result): DurableRunCompletion;
    failed(error: unknown): DurableRunCompletion;
}

export async function runDurableAgent<Provider extends DurableProvider, Result>(
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
        await options.repository.completeRun(target.id, acquired.token, options.failed(error));
        throw error;
    }

    await options.repository.completeRun(target.id, acquired.token, options.succeeded(result));
    return { agent: target, result };
}
