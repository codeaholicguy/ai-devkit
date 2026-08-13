import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'ink';
import { stripVTControlCharacters } from 'node:util';
import {
    adjustPreviewScrollOffsetForAppendedRows,
    buildPreviewViewport,
    getPreviewPanelTone,
    getPreviewChannelStatusText,
    PreviewPane,
} from '../../../tui/console/PreviewPane.js';
import { AgentStatus, type AgentInfo, type ConversationMessage } from '@ai-devkit/agent-manager';

const messages: ConversationMessage[] = [
    { role: 'user', content: 'first question', timestamp: '2026-07-02T10:00:00Z' },
    { role: 'assistant', content: 'first answer\nwith detail', timestamp: '2026-07-02T10:00:01Z' },
    { role: 'user', content: 'second question', timestamp: '2026-07-02T10:00:02Z' },
    { role: 'assistant', content: 'second answer', timestamp: '2026-07-02T10:00:03Z' },
];

describe('PreviewPane helpers', () => {
    it('uses success tone when the selected agent has channel status', () => {
        expect(getPreviewPanelTone({ channelName: 'telegram', channelType: 'telegram', bridgePid: 42 })).toBe('success');
    });

    it('uses default tone when the selected agent is not connected to a channel', () => {
        expect(getPreviewPanelTone(undefined)).toBe('default');
    });

    it('formats connected channel status text', () => {
        expect(getPreviewChannelStatusText({ channelName: 'telegram', channelType: 'telegram', bridgePid: 42 })).toBe('Connected: telegram');
    });

    it('builds a viewport pinned to the newest conversation content at offset zero', () => {
        const viewport = buildPreviewViewport(messages, 3, 0);

        expect(viewport.clampedOffset).toBe(0);
        expect(viewport.hasAbove).toBe(true);
        expect(viewport.hasBelow).toBe(false);
        expect(viewport.rows).toHaveLength(3);
        expect(viewport.rows).toEqual([
            { kind: 'indicator', text: '↑ older', role: null },
            { kind: 'message', text: 'second question', role: 'user' },
            { kind: 'message', text: 'second answer', role: 'assistant' },
        ]);
    });

    it('builds a viewport over older conversation content at a positive offset', () => {
        const viewport = buildPreviewViewport(messages, 3, 3);

        expect(viewport.clampedOffset).toBe(3);
        expect(viewport.hasAbove).toBe(false);
        expect(viewport.hasBelow).toBe(true);
        expect(viewport.rows).toHaveLength(3);
        expect(viewport.rows).toEqual([
            { kind: 'indicator', text: '        ↓ newer', role: null },
            { kind: 'message', text: 'first question', role: 'user' },
            { kind: 'message', text: 'first answer', role: 'assistant' },
        ]);
    });

    it('clamps requested offsets to the valid scroll range', () => {
        expect(buildPreviewViewport(messages, 3, -2).clampedOffset).toBe(0);
        expect(buildPreviewViewport(messages, 3, 99).clampedOffset).toBe(3);
    });

    it('keeps the rendered body inside the viewport budget when overflow affordances are shown', () => {
        const viewport = buildPreviewViewport(messages, 4, 1);

        expect(viewport.hasAbove).toBe(true);
        expect(viewport.hasBelow).toBe(true);
        expect(viewport.rows).toHaveLength(4);
        expect(viewport.rows[0]).toEqual({ kind: 'indicator', text: '↑ older ↓ newer', role: null });
    });

    it('keeps role metadata separate from multiline message content', () => {
        const viewport = buildPreviewViewport([
            { role: 'assistant', content: 'Summary\n\n- first item', timestamp: '2026-07-02T10:00:00Z' },
        ], 4, 0);

        expect(viewport.rows).toEqual([
            { kind: 'message', text: 'Summary', role: 'assistant' },
            { kind: 'message', text: '', role: null },
            { kind: 'message', text: '- first item', role: null },
        ]);
    });

    it('renders roles in a fixed gutter and message content in a neutral column', () => {
        const agent = {
            name: 'preview-test',
            type: 'codex',
            status: AgentStatus.RUNNING,
            projectPath: '/tmp/project',
            lastActive: new Date(),
        } as AgentInfo;
        const output = stripVTControlCharacters(renderToString(React.createElement(PreviewPane, {
            agent,
            messages: [
                { role: 'user', content: 'first question' },
                { role: 'assistant', content: 'first answer\nwith detail' },
            ],
            error: null,
            isLoading: false,
            maxLines: 8,
        }), { columns: 80 }));

        expect(output).toContain('user      │ first question');
        expect(output).toContain('assistant │ first answer\n          │ with detail');
        expect(output).not.toContain('assistant: first answer');
    });

    it('adjusts positive scroll offsets by newly appended rendered rows', () => {
        expect(adjustPreviewScrollOffsetForAppendedRows(5, 7, 2)).toBe(4);
        expect(adjustPreviewScrollOffsetForAppendedRows(5, 7, 0)).toBe(0);
        expect(adjustPreviewScrollOffsetForAppendedRows(7, 5, 2)).toBe(2);
    });
});
