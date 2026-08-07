import { describe, expect, it, vi } from 'vitest';

describe('ClaudeCliProbe', () => {
    it('validates only version/help and requires the print session flags', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        expect(api).toHaveProperty('ClaudeCliProbe');
        const exec = vi.fn()
            .mockResolvedValueOnce({ stdout: '2.1.220\n', stderr: '' })
            .mockResolvedValueOnce({
                stdout: '--print --session-id --resume --output-format stream-json', stderr: '',
            });
        const Probe = api.ClaudeCliProbe as new (options: unknown) => { validate(): Promise<unknown> };

        await expect(new Probe({ exec }).validate()).resolves.toEqual({
            executable: 'claude', version: '2.1.220',
        });
        expect(exec.mock.calls).toEqual([
            ['claude', ['--version']],
            ['claude', ['--help']],
        ]);
    });

    it('rejects a CLI missing a required capability', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        const exec = vi.fn()
            .mockResolvedValueOnce({ stdout: 'old', stderr: '' })
            .mockResolvedValueOnce({ stdout: '--print only', stderr: '' });
        const Probe = api.ClaudeCliProbe as new (options: unknown) => { validate(): Promise<unknown> };

        await expect(new Probe({ exec }).validate()).rejects.toMatchObject({ code: 'CLAUDE_CLI_UNSUPPORTED' });
    });
});
