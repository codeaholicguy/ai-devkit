import { AgentStatus, type AgentInfo } from '@ai-devkit/agent-manager';
import { describe, expect, it } from 'vitest';
import {
    getChannelActionError,
    getConnectedChannelName,
} from '../../../../tui/console/hooks/useChannelActions.js';

const agent = (name = 'api-agent'): AgentInfo => ({
    name,
    pid: 123,
    status: AgentStatus.RUNNING,
    projectPath: '/tmp/project',
    lastActive: new Date('2026-06-04T00:00:00.000Z'),
    type: 'codex',
});

describe('getChannelActionError', () => {
    it('returns explicit subprocess errors', () => {
        expect(getChannelActionError('channel start', { exitCode: 1, error: 'No channel configured' })).toBe('No channel configured');
    });

    it('returns fallback text for non-zero exits without stderr', () => {
        expect(getChannelActionError('channel stop', { exitCode: 2 })).toBe('channel stop exited 2');
    });

    it('returns null for successful actions', () => {
        expect(getChannelActionError('channel start', { exitCode: 0 })).toBeNull();
    });

    it('returns null for signal exits without stderr', () => {
        expect(getChannelActionError('channel stop', { exitCode: null })).toBeNull();
    });
});

describe('getConnectedChannelName', () => {
    it('returns the selected agent connected channel name', () => {
        expect(
            getConnectedChannelName(agent(), {
                'api-agent': {
                    channelName: 'work',
                    channelType: 'telegram',
                    bridgePid: 456,
                },
            }),
        ).toBe('work');
    });

    it('returns null when the selected agent has no channel', () => {
        expect(getConnectedChannelName(agent('other-agent'), {})).toBeNull();
    });

    it('returns null when no agent is selected', () => {
        expect(getConnectedChannelName(null, {})).toBeNull();
    });
});
