import { describe, expect, it } from 'vitest';
import {
    buildPreviewViewport,
    getPreviewPanelTone,
    getPreviewChannelStatusText,
} from '../../../tui/console/PreviewPane.js';
import type { ConversationMessage } from '@ai-devkit/agent-manager';

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
        expect(viewport.lines).toEqual([
            '  with detail',
            'user: second question',
            'assistant: second answer',
        ]);
    });

    it('builds a viewport over older conversation content at a positive offset', () => {
        const viewport = buildPreviewViewport(messages, 3, 2);

        expect(viewport.clampedOffset).toBe(2);
        expect(viewport.hasAbove).toBe(false);
        expect(viewport.hasBelow).toBe(true);
        expect(viewport.lines).toEqual([
            'user: first question',
            'assistant: first answer',
            '  with detail',
        ]);
    });

    it('clamps requested offsets to the valid scroll range', () => {
        expect(buildPreviewViewport(messages, 3, -2).clampedOffset).toBe(0);
        expect(buildPreviewViewport(messages, 3, 99).clampedOffset).toBe(2);
    });
});
