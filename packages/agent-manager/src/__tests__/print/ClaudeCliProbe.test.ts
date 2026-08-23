import { describe, expect, it, vi } from 'vitest';
import { ClaudeCliProbe } from '../../providers/claude/durable/ClaudeCliProbe.js';

describe('ClaudeCliProbe', () => {
    it('validates only version/help and requires the print session flags', async () => {
        const exec = vi.fn()
            .mockResolvedValueOnce({ stdout: '2.1.220\n', stderr: '' })
            .mockResolvedValueOnce({
                stdout: '--print --session-id --resume --output-format stream-json', stderr: '',
            });

        await expect(new ClaudeCliProbe({ exec }).validate()).resolves.toEqual({
            executable: 'claude', version: '2.1.220',
        });
        expect(exec.mock.calls).toEqual([
            ['claude', ['--version']],
            ['claude', ['--help']],
        ]);
    });

    it('rejects a CLI missing a required capability', async () => {
        const exec = vi.fn()
            .mockResolvedValueOnce({ stdout: 'old', stderr: '' })
            .mockResolvedValueOnce({ stdout: '--print only', stderr: '' });

        await expect(new ClaudeCliProbe({ exec }).validate()).rejects.toMatchObject({ code: 'CLAUDE_CLI_UNSUPPORTED' });
    });
});
