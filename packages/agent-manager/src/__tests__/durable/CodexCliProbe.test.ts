import { describe, expect, it, vi } from 'vitest';

describe('CodexCliProbe', () => {
    it('validates version, exec JSON/stdin, and resume capabilities without a model call', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        expect(api).toHaveProperty('CodexCliProbe');
        const exec = vi.fn()
            .mockResolvedValueOnce({ stdout: 'codex-cli 0.147.0', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'Usage: codex exec [PROMPT]\n--json\n- read from stdin\nresume', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'Usage: codex exec resume [SESSION_ID] [PROMPT]\n--json\n- stdin', stderr: '' });
        const Probe = api.CodexCliProbe as new (options: unknown) => any;

        await expect(new Probe({ executable: 'fake-codex', exec }).validate()).resolves.toEqual({
            executable: 'fake-codex', version: 'codex-cli 0.147.0',
        });
        expect(exec.mock.calls).toEqual([
            ['fake-codex', ['--version']],
            ['fake-codex', ['exec', '--help']],
            ['fake-codex', ['exec', 'resume', '--help']],
        ]);
    });

    it('rejects unsupported and unavailable CLIs with bounded sanitized errors', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        const Probe = api.CodexCliProbe as new (options: unknown) => any;
        const unsupported = new Probe({ exec: vi.fn()
            .mockResolvedValueOnce({ stdout: 'version', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'exec', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'resume', stderr: '' }) });
        await expect(unsupported.validate()).rejects.toMatchObject({ code: 'CODEX_CLI_UNSUPPORTED' });
        const missingCommands = new Probe({ exec: vi.fn()
            .mockResolvedValueOnce({ stdout: 'version', stderr: '' })
            .mockResolvedValueOnce({ stdout: '', stderr: '' })
            .mockResolvedValueOnce({ stdout: '', stderr: '' }) });
        await expect(missingCommands.validate()).rejects.toMatchObject({ code: 'CODEX_CLI_UNSUPPORTED' });

        const unavailable = new Probe({ exec: vi.fn().mockRejectedValue(new Error(`bad\0${'x'.repeat(1000)}`)) });
        const error = await unavailable.validate().catch((value: Error & { code: string }) => value);
        expect(error.code).toBe('CODEX_CLI_UNAVAILABLE');
        expect(error.message).not.toContain('\0');
        expect(error.message.length).toBeLessThan(600);
    });

    it('reports an empty version response as unknown', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        const Probe = api.CodexCliProbe as new (options: unknown) => any;
        const exec = vi.fn()
            .mockResolvedValueOnce({ stdout: ' \n', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'exec --json -', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'resume --json -', stderr: '' });
        await expect(new Probe({ exec }).validate()).resolves.toMatchObject({ version: 'unknown' });
    });

    it('requires a standalone stdin dash rather than accepting flag hyphens', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;
        const Probe = api.CodexCliProbe as new (options: unknown) => any;
        const exec = vi.fn()
            .mockResolvedValueOnce({ stdout: 'version', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'exec --json', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'resume --json', stderr: '' });
        await expect(new Probe({ exec }).validate()).rejects.toMatchObject({ code: 'CODEX_CLI_UNSUPPORTED' });
    });
});
