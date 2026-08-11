import { describe, expect, it, vi } from 'vitest';

const SESSION = '22222222-2222-4222-8222-222222222222';
const base = {
    id: 'id', name: 'reviewer', provider: 'codex', providerSessionId: null, sessionHealth: 'uninitialized',
};

describe('CodexPrintAgentService', () => {
    it('validates before provider-aware create and never runs Codex', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        expect(api).toHaveProperty('CodexPrintAgentService');
        const probe = { validate: vi.fn().mockResolvedValue({ executable: 'codex', version: '0.147.0' }) };
        const repository = { create: vi.fn().mockResolvedValue(base) };
        const runner = { run: vi.fn() };
        const Service = api.CodexPrintAgentService as new (options: unknown) => any;
        await new Service({ repository, probe, runner }).create({ name: 'reviewer', cwd: '/project' });
        expect(repository.create).toHaveBeenCalledWith({ name: 'reviewer', cwd: '/project', provider: 'codex' });
        expect(runner.run).not.toHaveBeenCalled();
    });

    it('binds during first send and explicitly resumes later sends', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        const repository = {
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
});
