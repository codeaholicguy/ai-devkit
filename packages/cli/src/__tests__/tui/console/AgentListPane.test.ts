import React from 'react';
import { renderToString } from 'ink';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ai-devkit/agent-manager', () => ({
    AgentStatus: {
        RUNNING: 'running',
        WAITING: 'waiting',
        IDLE: 'idle',
        UNKNOWN: 'unknown',
    },
}));

import { AgentListPane, getAgentChannelMarker } from '../../../tui/console/AgentListPane.js';

describe('AgentListPane helpers', () => {
    it('uses a compact ASCII remote marker for connected agents', () => {
        expect(getAgentChannelMarker({ channelName: 'telegram', channelType: 'telegram', bridgePid: 42 })).toBe('remote');
    });

    it('uses blank spacing for disconnected agents', () => {
        expect(getAgentChannelMarker(undefined)).toBe('      ');
    });

    it('marks cached rows and keeps a refresh error visible alongside them', () => {
        const output = renderToString(React.createElement(AgentListPane, {
            agents: [{
                name: 'cached-agent',
                type: 'claude',
                status: 'unknown',
                summary: '',
                pid: 42,
                projectPath: '/repo/cached',
                sessionId: 'cached-session',
                lastActive: new Date('2026-08-14T10:00:00.000Z'),
            }],
            selectedName: 'cached-agent',
            onSelect: vi.fn(),
            error: 'adapter unavailable',
            cachedAgentPids: new Set([42]),
            width: 60,
        }));

        expect(output).toContain('cached · /repo/cached');
        expect(output).toContain('adapter unavailable');
    });
});
