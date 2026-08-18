import { describe, expect, it, vi } from 'vitest';
import { toggleAgentPin } from '../../../tui/console/toggleAgentPin.js';

describe('toggleAgentPin', () => {
    it('toggles through the manager and refreshes the console list', async () => {
        const manager = { togglePin: vi.fn().mockReturnValue(true) };
        const refresh = vi.fn().mockResolvedValue(undefined);

        await expect(toggleAgentPin(manager, 'agent-a', refresh)).resolves.toBe(true);
        expect(manager.togglePin).toHaveBeenCalledWith('agent-a');
        expect(refresh).toHaveBeenCalledOnce();
    });

    it('does not refresh when the manager rejects a stale selection', async () => {
        const manager = { togglePin: vi.fn(() => { throw new Error('Agent is no longer running.'); }) };
        const refresh = vi.fn().mockResolvedValue(undefined);

        await expect(toggleAgentPin(manager, 'gone', refresh)).rejects.toThrow('no longer running');
        expect(refresh).not.toHaveBeenCalled();
    });
});
