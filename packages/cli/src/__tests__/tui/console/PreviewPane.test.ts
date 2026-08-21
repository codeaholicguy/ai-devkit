import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, renderToString } from 'ink';
import { PassThrough } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import {
    adjustPreviewScrollOffsetForAppendedRows,
    buildPreviewViewport,
    getPreviewPanelTone,
    getPreviewChannelStatusText,
    PreviewPane,
} from '../../../tui/console/PreviewPane.js';
import { AgentStatus, type AgentInfo, type ConversationMessage } from '@ai-devkit/agent-manager';
import * as markdownPreview from '../../../tui/console/render/markdownPreview.js';

const messages: ConversationMessage[] = [
    { role: 'user', content: 'first question', timestamp: '2026-07-02T10:00:00Z' },
    { role: 'assistant', content: 'first answer\nwith detail', timestamp: '2026-07-02T10:00:01Z' },
    { role: 'user', content: 'second question', timestamp: '2026-07-02T10:00:02Z' },
    { role: 'assistant', content: 'second answer', timestamp: '2026-07-02T10:00:03Z' },
];

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

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
            { kind: 'header', text: '', role: 'assistant', timestamp: '2026-07-02T10:00:03Z' },
            { kind: 'content', text: 'second answer', role: 'assistant', spans: [{ text: 'second answer' }] },
        ]);
    });

    it('builds a viewport over older conversation content at a positive offset', () => {
        const viewport = buildPreviewViewport(messages, 3, 10);

        expect(viewport.clampedOffset).toBe(10);
        expect(viewport.hasAbove).toBe(false);
        expect(viewport.hasBelow).toBe(true);
        expect(viewport.rows).toHaveLength(3);
        expect(viewport.rows).toEqual([
            { kind: 'indicator', text: '        ↓ newer', role: null },
            { kind: 'header', text: '', role: 'user', timestamp: '2026-07-02T10:00:00Z' },
            { kind: 'content', text: 'first question', role: 'user', spans: [{ text: 'first question' }] },
        ]);
    });

    it('clamps requested offsets to the valid scroll range', () => {
        expect(buildPreviewViewport(messages, 3, -2).clampedOffset).toBe(0);
        expect(buildPreviewViewport(messages, 3, 99).clampedOffset).toBe(10);
    });

    it('keeps the rendered body inside the viewport budget when overflow affordances are shown', () => {
        const viewport = buildPreviewViewport(messages, 4, 1);

        expect(viewport.hasAbove).toBe(true);
        expect(viewport.hasBelow).toBe(true);
        expect(viewport.rows).toHaveLength(4);
        expect(viewport.rows[0]).toEqual({
            kind: 'indicator',
            text: '↑ older · user continued ↓ newer',
            role: null,
        });
    });

    it('builds a structured block for multiline message content', () => {
        const viewport = buildPreviewViewport([
            { role: 'assistant', content: 'Summary\n\n- first item', timestamp: '2026-07-02T10:00:00Z' },
        ], 6, 0);

        expect(viewport.rows).toEqual([
            { kind: 'header', text: '', role: 'assistant', timestamp: '2026-07-02T10:00:00Z' },
            { kind: 'content', text: 'Summary', role: 'assistant', spans: [{ text: 'Summary' }] },
            { kind: 'content', text: '', role: 'assistant', spans: [{ text: '' }] },
            {
                kind: 'content',
                text: '• first item',
                role: 'assistant',
                spans: [{ text: '• ' }, { text: 'first item' }],
            },
        ]);
    });

    it('renders conversation turns using the agent detail format', () => {
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

        expect(output).toContain('user:\n  first question\n\nassistant:\n  first answer\n  with detail');
        expect(output).not.toContain('assistant: first answer');
        expect(output).not.toContain('assistant │ first answer');
    });

    it('shows a working indicator for the selected running agent', () => {
        const agent = {
            name: 'preview-test',
            type: 'codex',
            status: AgentStatus.RUNNING,
            projectPath: '/tmp/project',
            lastActive: new Date(),
        } as AgentInfo;

        const output = stripVTControlCharacters(renderToString(React.createElement(PreviewPane, {
            agent,
            messages: [],
            error: null,
            isLoading: false,
        }), { columns: 80 }));

        expect(output).toContain('working');
    });

    it('reclaims the activity row for conversation content when the agent stops running', () => {
        const renderStatus = (status: AgentStatus) => {
            const agent = {
                name: 'preview-test',
                type: 'codex',
                status,
                projectPath: '/tmp/project',
                lastActive: new Date(),
            } as AgentInfo;

            return stripVTControlCharacters(renderToString(React.createElement(PreviewPane, {
                agent,
                messages: [{ role: 'assistant', content: 'line one\nline two\nline three\nline four' }],
                error: null,
                isLoading: false,
                maxLines: 4,
            }), { columns: 80 }));
        };

        const running = renderStatus(AgentStatus.RUNNING);
        const waiting = renderStatus(AgentStatus.WAITING);

        expect(running).not.toContain('line two');
        expect(running).toContain('line three');
        expect(running).toContain('line four');
        expect(running).toContain('working');
        expect(waiting).toContain('line two\n  line three\n  line four');
        expect(waiting).not.toContain('working');
    });

    it.each([
        AgentStatus.WAITING,
        AgentStatus.IDLE,
        AgentStatus.UNKNOWN,
    ])('hides the indicator for %s agents', status => {
        const agent = {
            name: 'preview-test',
            type: 'codex',
            status,
            pinned: true,
            projectPath: '/tmp/project',
            lastActive: new Date(),
        } as AgentInfo;
        const output = renderToString(React.createElement(PreviewPane, {
            agent,
            messages: [],
            error: null,
            isLoading: false,
        }));

        expect(output).not.toContain('working');
    });

    it('keeps a pinned running agent active because pinning has no status effect', () => {
        const agent = {
            name: 'preview-test',
            type: 'codex',
            status: AgentStatus.RUNNING,
            pinned: true,
            projectPath: '/tmp/project',
            lastActive: new Date(),
        } as AgentInfo;

        expect(renderToString(React.createElement(PreviewPane, {
            agent,
            messages: [],
            error: null,
            isLoading: false,
        }))).toContain('working');
    });

    it('renders Markdown message bodies without source punctuation', () => {
        const agent = {
            name: 'preview-test',
            type: 'codex',
            status: AgentStatus.RUNNING,
            projectPath: '/tmp/project',
            lastActive: new Date(),
        } as AgentInfo;
        const output = stripVTControlCharacters(renderToString(React.createElement(PreviewPane, {
            agent,
            messages: [{
                role: 'assistant',
                content: '# Heading\n\nUse **bold** and [docs](https://example.com).',
                timestamp: '2026-07-02T10:00:00Z',
            }],
            error: null,
            isLoading: false,
            maxLines: 8,
        }), { columns: 80 }));

        expect(output).toContain('assistant:\n  Heading\n  Use bold and docs (https://example.com).');
        expect(output).not.toContain('# Heading');
        expect(output).not.toContain('**bold**');
        expect(output).not.toContain('[docs]');
        expect(output).toMatch(/\[[^\]]+\] assistant:/u);
    });

    it('preserves selected, loading, empty, error, and channel status states', () => {
        const agent = {
            name: 'preview-test',
            type: 'codex',
            status: AgentStatus.RUNNING,
            projectPath: '/tmp/project',
            lastActive: new Date(),
        } as AgentInfo;
        const renderPane = (props: Partial<React.ComponentProps<typeof PreviewPane>>) =>
            stripVTControlCharacters(renderToString(React.createElement(PreviewPane, {
                agent,
                messages: [],
                error: null,
                isLoading: false,
                ...props,
            }), { columns: 80 }));

        expect(renderPane({ agent: null })).toContain('No agent selected.');
        expect(renderPane({ isLoading: true })).toContain('loading…');
        expect(renderPane({})).toContain('No messages yet.');
        expect(renderPane({
            error: { kind: 'no-session-file', message: 'missing' },
        })).toContain('No session file available for this agent yet.');
        expect(renderPane({
            channelStatus: { channelName: 'telegram', channelType: 'telegram', bridgePid: 42 },
        })).toContain('Connected: telegram');
    });

    it('adjusts positive scroll offsets by newly appended rendered rows', () => {
        expect(adjustPreviewScrollOffsetForAppendedRows(5, 7, 2)).toBe(4);
        expect(adjustPreviewScrollOffsetForAppendedRows(5, 7, 0)).toBe(0);
        expect(adjustPreviewScrollOffsetForAppendedRows(7, 5, 2)).toBe(2);
    });

    it('does not reparse Markdown or rebuild laid-out rows when only scroll offset changes', async () => {
        const agent = {
            name: 'preview-test',
            type: 'codex',
            status: AgentStatus.RUNNING,
            projectPath: '/tmp/project',
            lastActive: new Date(),
        } as AgentInfo;
        let contentReads = 0;
        const message = { role: 'assistant', timestamp: '2026-07-02T10:00:00Z' } as ConversationMessage;
        Object.defineProperty(message, 'content', {
            get: () => {
                contentReads += 1;
                return 'first line\nsecond line\nthird line';
            },
        });
        const stableMessages = [message];
        const renderRowsSpy = vi.spyOn(markdownPreview, 'renderMarkdownRows');
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const preview = (scrollOffset: number) => React.createElement(PreviewPane, {
            agent,
            messages: stableMessages,
            error: null,
            isLoading: false,
            maxLines: 4,
            scrollOffset,
        });
        const instance = render(preview(0), { stdout, interactive: false, patchConsole: false });
        await instance.waitUntilRenderFlush();
        const readsAfterInitialRender = contentReads;
        const layoutCallsAfterInitialRender = renderRowsSpy.mock.calls.length;
        expect(readsAfterInitialRender).toBe(1);
        expect(layoutCallsAfterInitialRender).toBe(1);

        instance.rerender(preview(1));
        await instance.waitUntilRenderFlush();

        expect(contentReads).toBe(readsAfterInitialRender);
        expect(renderRowsSpy).toHaveBeenCalledTimes(layoutCallsAfterInitialRender);
        instance.unmount();
        await instance.waitUntilExit();
        renderRowsSpy.mockRestore();
    });

    it('keeps animation ticks inside the leaf without touching parent renders or scroll state', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
        const agent = {
            name: 'preview-test',
            type: 'codex',
            status: AgentStatus.RUNNING,
            projectPath: '/tmp/project',
            lastActive: new Date(),
        } as AgentInfo;
        const stableMessages: ConversationMessage[] = [{
            role: 'assistant',
            content: 'first line\nsecond line\nthird line\nfourth line',
        }];
        const renderRowsSpy = vi.spyOn(markdownPreview, 'renderMarkdownRows');
        const onScrollOffsetClamp = vi.fn();
        let parentRenders = 0;
        const Parent = () => {
            parentRenders += 1;
            return React.createElement(PreviewPane, {
                agent,
                messages: stableMessages,
                error: null,
                isLoading: false,
                maxLines: 4,
                scrollOffset: 1,
                onScrollOffsetClamp,
            });
        };
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        Object.assign(stdout, { columns: 80, rows: 24, isTTY: true });
        const instance = render(React.createElement(Parent), {
            stdout,
            interactive: true,
            patchConsole: false,
            maxFps: 60,
        });
        await instance.waitUntilRenderFlush();
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(parentRenders).toBe(1);
        expect(renderRowsSpy).toHaveBeenCalledTimes(1);
        expect(onScrollOffsetClamp).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(480);
        await instance.waitUntilRenderFlush();

        expect(parentRenders).toBe(1);
        expect(renderRowsSpy).toHaveBeenCalledTimes(1);
        expect(onScrollOffsetClamp).not.toHaveBeenCalled();
        instance.unmount();
        vi.useRealTimers();
        await instance.waitUntilExit();
    });

    it('rebuilds layout when content width changes while messages stay stable', async () => {
        const agent = {
            name: 'preview-test',
            type: 'codex',
            status: AgentStatus.RUNNING,
            projectPath: '/tmp/project',
            lastActive: new Date(),
        } as AgentInfo;
        const stableMessages: ConversationMessage[] = [{
            role: 'assistant',
            content: 'alpha beta gamma delta',
        }];
        const renderRowsSpy = vi.spyOn(markdownPreview, 'renderMarkdownRows');
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const preview = (contentWidth: number) => React.createElement(PreviewPane, {
            agent,
            messages: stableMessages,
            error: null,
            isLoading: false,
            maxLines: 8,
            contentWidth,
        });
        const instance = render(preview(40), { stdout, interactive: false, patchConsole: false });
        await instance.waitUntilRenderFlush();
        expect(renderRowsSpy).toHaveBeenCalledTimes(1);

        instance.rerender(preview(10));
        await instance.waitUntilRenderFlush();

        expect(renderRowsSpy).toHaveBeenCalledTimes(2);
        instance.unmount();
        await instance.waitUntilExit();
    });

    it('renders only rows selected by the visible viewport slice', () => {
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
                { role: 'user', content: 'OFF_VIEWPORT_SENTINEL' },
                { role: 'assistant', content: 'newest answer' },
            ],
            error: null,
            isLoading: false,
            maxLines: 3,
            scrollOffset: 0,
        }), { columns: 80 }));

        expect(output).toContain('newest answer');
        expect(output).not.toContain('OFF_VIEWPORT_SENTINEL');
    });
});
