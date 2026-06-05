import { describe, expect, it, vi } from 'vitest';

vi.mock('@ai-devkit/agent-manager', () => ({
    AgentStatus: {
        RUNNING: 'running',
        WAITING: 'waiting',
        IDLE: 'idle',
        UNKNOWN: 'unknown',
    },
}));

import { getAgentChannelMarker } from '../../../tui/console/AgentListPane.js';

describe('AgentListPane helpers', () => {
    it('uses a compact ASCII remote marker for connected agents', () => {
        expect(getAgentChannelMarker({ channelName: 'telegram', channelType: 'telegram', bridgePid: 42 })).toBe('remote');
    });

    it('uses blank spacing for disconnected agents', () => {
        expect(getAgentChannelMarker(undefined)).toBe('      ');
    });
});
