import { describe, expect, it, vi } from 'vitest';

describe('PiCliProbe', () => {
    it('validates documented JSON mode and session capabilities', async () => {
        const api = await import('../../../../index.js') as Record<string, unknown>;
        expect(api).toHaveProperty('PiCliProbe');
        const exec = vi.fn()
            .mockResolvedValueOnce({ stdout: 'pi 0.52.8', stderr: '' })
            .mockResolvedValueOnce({ stdout: '--mode json\n--session-id <uuid>\n--session <path|id>', stderr: '' });
        const Probe = api.PiCliProbe as new (options: unknown) => any;
        await expect(new Probe({ executable: 'fake-pi', exec }).validate()).resolves.toEqual({
            executable: 'fake-pi', version: 'pi 0.52.8',
        });
        expect(exec.mock.calls).toEqual([['fake-pi', ['--version']], ['fake-pi', ['--help']]]);
    });

    it('rejects unsupported and unavailable CLIs with sanitized errors', async () => {
        const api = await import('../../../../index.js') as Record<string, unknown>;
        const Probe = api.PiCliProbe as new (options: unknown) => any;
        await expect(new Probe({ exec: vi.fn()
            .mockResolvedValueOnce({ stdout: '', stderr: '' })
            .mockResolvedValueOnce({ stdout: '--print only', stderr: '' }) }).validate())
            .rejects.toMatchObject({ code: 'PI_CLI_UNSUPPORTED' });
        const unavailable = new Probe({ exec: vi.fn().mockRejectedValue(new Error(`bad\0${'x'.repeat(1000)}`)) });
        const error = await unavailable.validate().catch((value: Error & { code: string }) => value);
        expect(error.code).toBe('PI_CLI_UNAVAILABLE');
        expect(error.message).not.toContain('\0');
        expect(error.message.length).toBeLessThan(600);
    });

    it('reports an empty version as unknown', async () => {
        const api = await import('../../../../index.js') as Record<string, unknown>;
        const Probe = api.PiCliProbe as new (options: unknown) => any;
        const exec = vi.fn().mockResolvedValueOnce({ stdout: ' \n', stderr: '' })
            .mockResolvedValueOnce({ stdout: '--mode json --session-id --session', stderr: '' });
        await expect(new Probe({ exec }).validate()).resolves.toMatchObject({ version: 'unknown' });
    });
});
