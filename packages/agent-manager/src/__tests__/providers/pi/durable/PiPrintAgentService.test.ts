import { describe, expect, it, vi } from 'vitest';
const SESSION = '22222222-2222-4222-8222-222222222222';
const base = { id: 'id', name: 'reviewer', provider: 'pi', providerSessionId: SESSION, sessionHealth: 'uninitialized' };

describe('PiPrintAgentService', () => {
    it('probes before provider-aware create', async () => {
        const api = await import('../../../../index.js') as Record<string, unknown>; expect(api).toHaveProperty('PiPrintAgentService');
        const probe = { validate: vi.fn() }; const repository = { create: vi.fn().mockResolvedValue(base), list: vi.fn() }; const runner = { run: vi.fn() };
        const Service = api.PiPrintAgentService as new (options: unknown) => any;
        await new Service({ repository, probe, runner }).create({ name: 'reviewer', cwd: '/project' });
        expect(probe.validate).toHaveBeenCalledOnce(); expect(repository.create).toHaveBeenCalledWith({ name: 'reviewer', cwd: '/project', provider: 'pi' });
    });

    it('records successful first and resumed sends', async () => {
        const api = await import('../../../../index.js') as Record<string, unknown>;
        const repository = { list: vi.fn(), resolve: vi.fn().mockResolvedValue(base), acquireRun: vi.fn()
            .mockResolvedValueOnce({ agent: base, token: 'one' }).mockResolvedValueOnce({ agent: { ...base, sessionHealth: 'healthy' }, token: 'two' }),
            recordProviderProcess: vi.fn(), completeRun: vi.fn() };
        const runner = { run: vi.fn(async (request) => { await request.onSpawn({ pid: 42, startedAt: 'start' }); return { sessionId: SESSION, result: 'answer', messages: ['answer'], exitCode: 0 }; }) };
        const Service = api.PiPrintAgentService as new (options: unknown) => any; const service = new Service({ repository, probe: { validate: vi.fn() }, runner });
        await service.send('reviewer', 'first'); await service.send('reviewer', 'later');
        expect(repository.completeRun).toHaveBeenCalledWith('id', 'one', expect.objectContaining({ status: 'succeeded', sessionHealth: 'healthy' }));
    });

    it('records mismatches and rejects missing and ambiguous records', async () => {
        const api = await import('../../../../index.js') as Record<string, unknown>; const ErrorType = api.PiPrintError as new (message: string, code: string) => Error;
        const completeRun = vi.fn(); const repository = { list: vi.fn(), resolve: vi.fn().mockResolvedValue(base), acquireRun: vi.fn().mockResolvedValue({ agent: base, token: 'one' }), recordProviderProcess: vi.fn(), completeRun };
        const Service = api.PiPrintAgentService as new (options: unknown) => any;
        await expect(new Service({ repository, probe: { validate: vi.fn() }, runner: { run: vi.fn().mockRejectedValue(new ErrorType('bad', 'PI_SESSION_MISMATCH')) } }).send('reviewer', 'x'))
            .rejects.toMatchObject({ code: 'PI_SESSION_MISMATCH' });
        expect(completeRun).toHaveBeenCalledWith('id', 'one', expect.objectContaining({ sessionHealth: 'mismatch' }));
        const earlyRepository = { ...repository, resolve: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce([base, base]), acquireRun: vi.fn() };
        const early = new Service({ repository: earlyRepository, probe: { validate: vi.fn() }, runner: { run: vi.fn() } });
        await expect(early.send('missing', 'x')).rejects.toMatchObject({ code: 'DURABLE_AGENT_NOT_FOUND' });
        await expect(early.send('many', 'x')).rejects.toMatchObject({ code: 'PI_UNSUPPORTED' });
    });

    it('rejects a non-Pi target without acquiring or mutating it', async () => {
        const api = await import('../../../../index.js') as Record<string, unknown>;
        const Service = api.PiPrintAgentService as new (options: unknown) => any;
        const repository = {
            resolve: vi.fn().mockResolvedValue({ ...base, provider: 'claude' }),
            acquireRun: vi.fn(), recordProviderProcess: vi.fn(), completeRun: vi.fn(),
        };

        await expect(new Service({ repository, probe: { validate: vi.fn() }, runner: { run: vi.fn() } })
            .send('reviewer', 'x')).rejects.toMatchObject({ code: 'PI_UNSUPPORTED' });
        expect(repository.acquireRun).not.toHaveBeenCalled();
        expect(repository.completeRun).not.toHaveBeenCalled();
    });

    it('does not turn a successful completion write failure into a second completion', async () => {
        const api = await import('../../../../index.js') as Record<string, unknown>;
        const Service = api.PiPrintAgentService as new (options: unknown) => any;
        const completionFailure = new Error('completion failed');
        const repository = {
            resolve: vi.fn().mockResolvedValue(base),
            acquireRun: vi.fn().mockResolvedValue({ agent: base, token: 'one' }),
            recordProviderProcess: vi.fn(), completeRun: vi.fn().mockRejectedValue(completionFailure),
        };
        const runner = { run: vi.fn().mockResolvedValue({
            sessionId: SESSION, result: 'answer', messages: ['answer'], exitCode: 0,
        }) };

        await expect(new Service({ repository, probe: { validate: vi.fn() }, runner })
            .send('reviewer', 'x')).rejects.toBe(completionFailure);
        expect(repository.completeRun).toHaveBeenCalledOnce();
    });
});
