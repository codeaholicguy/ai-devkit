import { PassThrough } from 'node:stream';
import React from 'react';
import { render } from 'ink';
import { describe, expect, it, vi } from 'vitest';
import type { AgentInfo } from '@ai-devkit/agent-manager';

vi.mock('@ai-devkit/agent-manager', () => ({
    AgentStatus: {
        RUNNING: 'running',
        WAITING: 'waiting',
        IDLE: 'idle',
        UNKNOWN: 'unknown',
    },
}));

import {
    getAgentMarker,
    getAgentDivider,
    isPinnedBoundary,
    MARKER_W,
    partitionPinned,
    selectInitialAgentName,
} from '../../../tui/console/agentListLayout.js';
import {
    clampAgentListScrollOffset,
    getAgentChannelMarker,
    getHighlightedNameSegments,
} from '../../../tui/console/AgentListPane.js';

function agent(name: string, pinned: boolean, lastActive: string): AgentInfo {
    return {
        name,
        pinned,
        lastActive: new Date(lastActive),
    } as AgentInfo;
}

describe('AgentListPane helpers', () => {
    it('uses a compact ASCII remote marker for connected agents', () => {
        expect(getAgentChannelMarker({ channelName: 'telegram', channelType: 'telegram', bridgePid: 42 })).toBe('remote');
    });

    it('renders filtered counts, query state, and remote channel markers', async () => {
        const { AgentListPane } = await import('../../../tui/console/AgentListPane.js');
        const output = new PassThrough();
        let rendered = '';
        output.on('data', chunk => { rendered += chunk.toString(); });
        const agents = [{
            name: 'Alpha Agent',
            type: 'codex',
            status: 'running',
            projectPath: '/tmp/project',
        }] as AgentInfo[];
        const instance = render(React.createElement(AgentListPane, {
            agents,
            selectedName: 'Alpha Agent',
            onSelect: vi.fn(),
            width: 44,
            height: 12,
            totalAgents: 3,
            filterText: 'agent',
            channelStatuses: { 'Alpha Agent': { channelName: 'telegram', channelType: 'telegram', bridgePid: 42 } },
        }), { stdout: output as unknown as NodeJS.WriteStream, interactive: false, patchConsole: false });
        await new Promise(resolve => setTimeout(resolve, 20));
        instance.unmount();
        await instance.waitUntilExit();
        expect(rendered).toContain('(1/3)');
        expect(rendered).toContain('[filtered]');
        expect(rendered).toContain('Alpha Agent');
        expect(rendered).toContain('remote');
    });

    it('keeps a visible filter prompt above the agent rows when inactive', async () => {
        const { AgentListPane } = await import('../../../tui/console/AgentListPane.js');
        const output = new PassThrough();
        let rendered = '';
        output.on('data', chunk => { rendered += chunk.toString(); });
        const agents = [{
            name: 'Alpha Agent', type: 'codex', status: 'running', projectPath: '/tmp/project',
        }] as AgentInfo[];
        const instance = render(React.createElement(AgentListPane, {
            agents, selectedName: 'Alpha Agent', onSelect: vi.fn(), width: 44, height: 12,
        }), { stdout: output as unknown as NodeJS.WriteStream, interactive: false, patchConsole: false });
        await new Promise(resolve => setTimeout(resolve, 20));
        instance.unmount();
        await instance.waitUntilExit();
        expect(rendered).toContain('FILTER');
        expect(rendered).toContain('/ to focus');
        expect(rendered.indexOf('FILTER')).toBeLessThan(rendered.indexOf('Alpha Agent'));
    });

    it('keeps the filter prompt visible when no agents are running', async () => {
        const { AgentListPane } = await import('../../../tui/console/AgentListPane.js');
        const output = new PassThrough();
        let rendered = '';
        output.on('data', chunk => { rendered += chunk.toString(); });
        const instance = render(React.createElement(AgentListPane, {
            agents: [], selectedName: null, onSelect: vi.fn(), width: 44, height: 12,
        }), { stdout: output as unknown as NodeJS.WriteStream, interactive: false, patchConsole: false });
        await new Promise(resolve => setTimeout(resolve, 20));
        instance.unmount();
        await instance.waitUntilExit();
        expect(rendered).toContain('FILTER');
        expect(rendered).toContain('/ to focus');
        expect(rendered).toContain('No running agents.');
    });

    it('preserves the compact total count when no filter session is active', async () => {
        const { AgentListPane } = await import('../../../tui/console/AgentListPane.js');
        const output = new PassThrough();
        let rendered = '';
        output.on('data', chunk => { rendered += chunk.toString(); });
        const agents = [{
            name: 'Alpha Agent', type: 'codex', status: 'running', projectPath: '/tmp/project',
        }] as AgentInfo[];
        const instance = render(React.createElement(AgentListPane, {
            agents, selectedName: 'Alpha Agent', onSelect: vi.fn(), width: 44, height: 12,
        }), { stdout: output as unknown as NodeJS.WriteStream, interactive: false, patchConsole: false });
        await new Promise(resolve => setTimeout(resolve, 20));
        instance.unmount();
        await instance.waitUntilExit();
        expect(rendered).toContain('(1)');
        expect(rendered).not.toContain('(1/1)');
    });

    it('shows a no-match message ahead of an incidental error when the source is non-empty', async () => {
        const { AgentListPane } = await import('../../../tui/console/AgentListPane.js');
        const output = new PassThrough();
        let rendered = '';
        output.on('data', chunk => { rendered += chunk.toString(); });
        const instance = render(React.createElement(AgentListPane, {
            agents: [], selectedName: null, onSelect: vi.fn(), width: 44, height: 12,
            totalAgents: 3, filterText: 'xyz', error: 'refresh failed',
        }), { stdout: output as unknown as NodeJS.WriteStream, interactive: false, patchConsole: false });
        await new Promise(resolve => setTimeout(resolve, 20));
        instance.unmount();
        await instance.waitUntilExit();
        expect(rendered).toContain('No agents match "xyz"');
        expect(rendered).not.toContain('refresh failed');
    });

    it('uses blank spacing for disconnected agents', () => {
        expect(getAgentChannelMarker(undefined)).toBe('      ');
    });

    it('leaves an unpinned list in input order without a boundary', () => {
        const input = [
            agent('status-first', false, '2026-08-16T01:00:00Z'),
            agent('status-second', false, '2026-08-16T02:00:00Z'),
        ];

        const result = partitionPinned(input);

        expect(result.map(({ name }) => name)).toEqual(['status-first', 'status-second']);
        expect(result).not.toBe(input);
        expect(isPinnedBoundary(result, 1)).toBe(false);
    });

    it('orders an all-pinned list by recency without a boundary', () => {
        const result = partitionPinned([
            agent('older', true, '2026-08-16T01:00:00Z'),
            agent('newer', true, '2026-08-16T02:00:00Z'),
        ]);

        expect(result.map(({ name }) => name)).toEqual(['newer', 'older']);
        expect(isPinnedBoundary(result, 1)).toBe(false);
    });

    it('partitions mixed agents, sorts pins by recency, and preserves unpinned order', () => {
        const input = [
            agent('unpinned-a', false, '2026-08-16T04:00:00Z'),
            agent('pinned-old', true, '2026-08-16T01:00:00Z'),
            agent('unpinned-b', false, '2026-08-16T03:00:00Z'),
            agent('pinned-new', true, '2026-08-16T02:00:00Z'),
        ];

        const result = partitionPinned(input);

        expect(result.map(({ name }) => name)).toEqual([
            'pinned-new', 'pinned-old', 'unpinned-a', 'unpinned-b',
        ]);
        expect(isPinnedBoundary(result, 1)).toBe(false);
        expect(isPinnedBoundary(result, 2)).toBe(true);
        expect(isPinnedBoundary(result, 3)).toBe(false);
        expect(input.map(({ name }) => name)).toEqual([
            'unpinned-a', 'pinned-old', 'unpinned-b', 'pinned-new',
        ]);
    });

    it('keeps equal-recency pins stable', () => {
        const result = partitionPinned([
            agent('first', true, '2026-08-16T01:00:00Z'),
            agent('second', true, '2026-08-16T01:00:00Z'),
        ]);

        expect(result.map(({ name }) => name)).toEqual(['first', 'second']);
    });

    it.each([
        [true, true, '▶*'],
        [false, true, ' *'],
        [true, false, '▶ '],
        [false, false, '  '],
    ])('renders the selected=%s pinned=%s marker in the fixed cell', (selected, pinned, expected) => {
        const marker = getAgentMarker(selected, pinned);

        expect(marker).toBe(expected);
        expect(marker).toHaveLength(MARKER_W);
    });

    it('keeps pin and remote markers independently visible', () => {
        expect({
            selection: getAgentMarker(true, true),
            channel: getAgentChannelMarker({ channelName: 'telegram', channelType: 'telegram', bridgePid: 42 }),
        }).toEqual({ selection: '▶*', channel: 'remote' });
    });

    it('formats the labeled boundary within the existing divider width', () => {
        const divider = getAgentDivider(24, true);

        expect(divider).toContain(' OTHERS ');
        expect(divider).toHaveLength(24);
        expect(getAgentDivider(24, false)).toBe('─'.repeat(24));
    });

    it('selects the first recency-ordered pin and falls back to the first agent', () => {
        expect(selectInitialAgentName([
            agent('fallback', false, '2026-08-16T03:00:00Z'),
            agent('older-pin', true, '2026-08-16T01:00:00Z'),
            agent('newer-pin', true, '2026-08-16T02:00:00Z'),
        ])).toBe('newer-pin');
        expect(selectInitialAgentName([
            agent('fallback', false, '2026-08-16T01:00:00Z'),
        ])).toBe('fallback');
        expect(selectInitialAgentName([])).toBeNull();
    });

    it('clamps a stale offset when filtering narrows and remains valid when it widens', () => {
        expect(clampAgentListScrollOffset(20, 2, 4)).toBe(0);
        expect(clampAgentListScrollOffset(0, 30, 4)).toBe(0);
        expect(clampAgentListScrollOffset(29, 30, 4)).toBe(26);
    });

    it('splits a clipped name around every matched substring', () => {
        expect(getHighlightedNameSegments('bananana', 'ana', 8)).toEqual([
            { text: 'b', matched: false },
            { text: 'ana', matched: true },
            { text: 'n', matched: false },
            { text: 'ana', matched: true },
        ]);
        expect(getHighlightedNameSegments('long-agent-name', 'agent', 8)).toEqual([
            { text: 'long-', matched: false },
            { text: 'ag', matched: true },
            { text: '…', matched: false },
        ]);
        expect(getHighlightedNameSegments('agent', '', 8)).toEqual([{ text: 'agent', matched: false }]);
    });
});
