import { createInteractiveRuntime } from '../../runtime/RuntimeFactory.js';

describe('AgentRuntime', () => {
    it('creates a runtime for each supported interactive provider', () => {
        expect(createInteractiveRuntime('herdr')).toMatchObject({ provider: 'herdr' });
        expect(createInteractiveRuntime('tmux')).toMatchObject({ provider: 'tmux' });
    });
});
