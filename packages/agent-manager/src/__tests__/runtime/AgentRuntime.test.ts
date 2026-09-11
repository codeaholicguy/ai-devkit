import { createInteractiveRuntime, isHerdrRegistryEntry } from '../../runtime/AgentRuntime.js';

describe('AgentRuntime', () => {
    it('creates a Herdr runtime only for the Herdr provider', () => {
        expect(createInteractiveRuntime('herdr')).toMatchObject({ provider: 'herdr' });
        expect(createInteractiveRuntime('tmux')).toBeNull();
    });

    it('identifies Herdr-backed registry entries', () => {
        expect(isHerdrRegistryEntry({
            name: 'reviewer',
            type: 'codex',
            pid: 123,
            runtime: 'herdr',
            runtimeRef: { session: 'default', paneId: 'w1:p2' },
        })).toBe(true);

        expect(isHerdrRegistryEntry({
            name: 'reviewer',
            type: 'codex',
            pid: 123,
            runtime: 'tmux',
            runtimeRef: { session: 'reviewer' },
        })).toBe(false);
    });
});
