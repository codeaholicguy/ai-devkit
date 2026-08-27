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

    it('rejects a non-Claude target without acquiring or mutating it', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        const Service = api.ClaudePrintAgentService as new (options: unknown) => any;
        const target = { id: 'id', name: 'reviewer', provider: 'pi' };
        const repository = {
            resolve: vi.fn().mockResolvedValue(target),
            acquireRun: vi.fn(), recordProviderProcess: vi.fn(), completeRun: vi.fn(),
        };

        await expect(new Service({ repository, probe: { validate: vi.fn() }, runner: { run: vi.fn() } })
            .send('reviewer', 'x')).rejects.toMatchObject({ code: 'CLAUDE_PRINT_UNSUPPORTED' });
        expect(repository.acquireRun).not.toHaveBeenCalled();
        expect(repository.completeRun).not.toHaveBeenCalled();
    });

    it('does not turn a successful completion write failure into a second completion', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        const Service = api.ClaudePrintAgentService as new (options: unknown) => any;
        const target = { id: 'id', name: 'reviewer', provider: 'claude', providerSessionId: 'session', sessionHealth: 'healthy' };
        const completionFailure = new Error('completion failed');
        const repository = {
            resolve: vi.fn().mockResolvedValue(target),
            acquireRun: vi.fn().mockResolvedValue({ agent: target, token: 'one' }),
            recordProviderProcess: vi.fn(), completeRun: vi.fn().mockRejectedValue(completionFailure),
        };
        const runner = { run: vi.fn().mockResolvedValue({ sessionId: 'session', result: 'answer', exitCode: 0 }) };

        await expect(new Service({ repository, probe: { validate: vi.fn() }, runner })
            .send('reviewer', 'x')).rejects.toBe(completionFailure);
        expect(repository.completeRun).toHaveBeenCalledOnce();
    });
});
