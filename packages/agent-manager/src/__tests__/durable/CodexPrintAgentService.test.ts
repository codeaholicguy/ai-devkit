import { describe, expect, it, vi } from 'vitest';

const SESSION = '22222222-2222-4222-8222-222222222222';
const base = {
    id: 'id', name: 'reviewer', provider: 'codex', providerSessionId: null, sessionHealth: 'uninitialized',
};

describe('CodexPrintAgentService', () => {
    it('constructs default non-billable dependencies without invoking them', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        const Service = api.CodexPrintAgentService as new () => any;
        expect(new Service().store).toBeDefined();
    });

    it('validates before provider-aware create and never runs Codex', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        expect(api).toHaveProperty('CodexPrintAgentService');
        const probe = { validate: vi.fn().mockResolvedValue({ executable: 'codex', version: '0.147.0' }) };
        const repository = { create: vi.fn().mockResolvedValue(base), list: vi.fn() };
        const runner = { run: vi.fn() };
        const Service = api.CodexPrintAgentService as new (options: unknown) => any;
        await new Service({ repository, probe, runner }).create({ name: 'reviewer', cwd: '/project' });
        expect(repository.create).toHaveBeenCalledWith({ name: 'reviewer', cwd: '/project', provider: 'codex' });
        expect(runner.run).not.toHaveBeenCalled();
    });

    it('binds during first send and explicitly resumes later sends', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        const repository = {
            list: vi.fn(),
            resolve: vi.fn().mockResolvedValue(base),
            acquireRun: vi.fn()
                .mockResolvedValueOnce({ agent: base, token: 'one' })
                .mockResolvedValueOnce({ agent: { ...base, providerSessionId: SESSION, sessionHealth: 'healthy' }, token: 'two' }),
            recordProviderProcess: vi.fn(), bindProviderSession: vi.fn(), completeRun: vi.fn(),
        };
        const runner = { run: vi.fn().mockImplementation(async (request) => {
            await request.onSpawn({ pid: 42, startedAt: 'start' });
            await request.onSession(SESSION);
            return { sessionId: SESSION, result: 'answer', messages: ['answer'], exitCode: 0 };
        }) };
        const Service = api.CodexPrintAgentService as new (options: unknown) => any;
        const service = new Service({ repository, probe: { validate: vi.fn() }, runner, executable: 'fake-codex' });

        await service.send('reviewer', 'first');
        await service.send('reviewer', 'later');

        expect(repository.bindProviderSession).toHaveBeenNthCalledWith(1, 'id', 'one', SESSION);
        expect(repository.bindProviderSession).toHaveBeenNthCalledWith(2, 'id', 'two', SESSION);
        expect(repository.completeRun).toHaveBeenCalledWith('id', 'one', expect.objectContaining({
            status: 'succeeded', sessionHealth: 'healthy',
        }));
    });

    it('records mismatch separately from unknown failures and rejects non-Codex targets', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        const ErrorType = api.CodexPrintError as new (message: string, code: string) => Error;
        const completeRun = vi.fn();
        const repository = {
            list: vi.fn(),
            resolve: vi.fn().mockResolvedValue(base), acquireRun: vi.fn().mockResolvedValue({ agent: base, token: 'one' }),
            recordProviderProcess: vi.fn(), bindProviderSession: vi.fn(), completeRun,
        };
        const Service = api.CodexPrintAgentService as new (options: unknown) => any;
        const service = new Service({ repository, probe: { validate: vi.fn() }, runner: {
            run: vi.fn().mockRejectedValue(new ErrorType('mismatch', 'CODEX_SESSION_MISMATCH')),
        } });
        await expect(service.send('reviewer', 'x')).rejects.toMatchObject({ code: 'CODEX_SESSION_MISMATCH' });
        expect(completeRun).toHaveBeenCalledWith('id', 'one', expect.objectContaining({ sessionHealth: 'mismatch' }));

        repository.acquireRun.mockResolvedValueOnce({ agent: { ...base, provider: 'claude' }, token: 'two' });
        await expect(service.send('reviewer', 'x')).rejects.toMatchObject({ code: 'CODEX_UNSUPPORTED' });
        expect(completeRun).toHaveBeenLastCalledWith('id', 'two', expect.objectContaining({ sessionHealth: 'unknown' }));
    });

    it('records a repository binding conflict as a session mismatch', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        const BindingError = api.CodexPrintError as new (message: string, code: string) => Error;
        const completeRun = vi.fn();
        const repository = {
            list: vi.fn(), resolve: vi.fn().mockResolvedValue(base),
            acquireRun: vi.fn().mockResolvedValue({ agent: base, token: 'one' }),
            recordProviderProcess: vi.fn(),
            bindProviderSession: vi.fn().mockRejectedValue(new BindingError('binding mismatch', 'CODEX_SESSION_MISMATCH')),
            completeRun,
        };
        const runner = { run: vi.fn().mockImplementation(async (request) => {
            await request.onSession(SESSION);
            return { sessionId: SESSION, result: 'x', messages: ['x'], exitCode: 0 };
        }) };
        const Service = api.CodexPrintAgentService as new (options: unknown) => any;

        await expect(new Service({ repository, probe: { validate: vi.fn() }, runner }).send('reviewer', 'x'))
            .rejects.toMatchObject({ code: 'CODEX_SESSION_MISMATCH' });
        expect(completeRun).toHaveBeenCalledWith('id', 'one', expect.objectContaining({ sessionHealth: 'mismatch' }));
    });

    it('rejects missing and ambiguous records before acquiring a run', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        const Service = api.CodexPrintAgentService as new (options: unknown) => any;
        const store = {
            list: vi.fn(), create: vi.fn(), resolve: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce([base, base]),
            acquireRun: vi.fn(), recordProviderProcess: vi.fn(), bindProviderSession: vi.fn(), completeRun: vi.fn(),
        };
        const service = new Service({ store, probe: { validate: vi.fn() }, runner: { run: vi.fn() } });
        await expect(service.send('missing', 'x')).rejects.toMatchObject({ code: 'PRINT_AGENT_NOT_FOUND' });
        await expect(service.send('ambiguous', 'x')).rejects.toMatchObject({ code: 'CODEX_UNSUPPORTED' });
        expect(store.acquireRun).not.toHaveBeenCalled();
    });
});
