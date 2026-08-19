import { describe, expect, it, vi } from 'vitest';

describe('ClaudePrintAgentService', () => {
    it('validates before create and does not run Claude', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        expect(api).toHaveProperty('ClaudePrintAgentService');
        const probe = { validate: vi.fn().mockResolvedValue({ executable: 'claude', version: '2.1.220' }) };
        const repository = { create: vi.fn().mockResolvedValue({ id: 'agent-id', name: 'reviewer' }) };
        const runner = { run: vi.fn() };
        const Service = api.ClaudePrintAgentService as new (options: unknown) => any;

        await expect(new Service({ repository, probe, runner }).create({ name: 'reviewer', cwd: '/project' }))
            .resolves.toMatchObject({ id: 'agent-id' });
        expect(probe.validate).toHaveBeenCalledOnce();
        expect(repository.create).toHaveBeenCalledWith({ name: 'reviewer', cwd: '/project' });
        expect(runner.run).not.toHaveBeenCalled();
    });

    it('runs first and resumed sends and records provider identity/results', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        const base = { id: 'id', name: 'reviewer', provider: 'claude', providerSessionId: 'session', sessionHealth: 'uninitialized' };
        const repository = {
            resolve: vi.fn().mockResolvedValue(base),
            acquireRun: vi.fn()
                .mockResolvedValueOnce({ agent: base, token: 'one' })
                .mockResolvedValueOnce({ agent: { ...base, sessionHealth: 'healthy' }, token: 'two' }),
            recordProviderProcess: vi.fn(), completeRun: vi.fn().mockResolvedValue({}),
        };
        const runner = { run: vi.fn().mockImplementation(async (request) => {
            await request.onSpawn({ pid: 42, startedAt: 'start' });
            return { sessionId: 'session', result: 'answer', exitCode: 0 };
        }) };
        const Service = api.ClaudePrintAgentService as new (options: unknown) => any;
        const service = new Service({ repository, probe: { validate: vi.fn() }, runner, executable: 'fake-claude' });

        await service.send('reviewer', 'first');
        await service.send('id', 'later');

        expect(runner.run.mock.calls[0][0]).toMatchObject({ prompt: 'first', firstRun: true, executable: 'fake-claude' });
        expect(runner.run.mock.calls[1][0]).toMatchObject({ prompt: 'later', firstRun: false, executable: 'fake-claude' });
        expect(repository.recordProviderProcess).toHaveBeenCalledWith('id', 'one', { pid: 42, startedAt: 'start' });
        expect(repository.completeRun).toHaveBeenCalledWith('id', 'one', expect.objectContaining({
            status: 'succeeded', exitCode: 0, sessionHealth: 'healthy',
        }));
    });
});
