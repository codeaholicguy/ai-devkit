/**
 * Tests for utils/ClaudeSessionParser.ts — focused on stripping
 * harness-injected XML tags from conversation content.
 */


import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClaudeSessionParser } from '../../utils/ClaudeSessionParser.js';

interface JsonlEntry {
    type: 'user' | 'assistant' | 'system';
    message: { content: string | Array<{ type: string; text?: string; content?: string; name?: string; input?: unknown; is_error?: boolean }> };
    timestamp?: string;
}

function writeSession(entries: JsonlEntry[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-test-'));
    const filePath = path.join(dir, 'session.jsonl');
    fs.writeFileSync(filePath, entries.map(e => JSON.stringify(e)).join('\n'));
    return filePath;
}

describe('ClaudeSessionParser.getConversation — harness tag stripping', () => {
    let parser: ClaudeSessionParser;
    const tempFiles: string[] = [];

    beforeEach(() => {
        parser = new ClaudeSessionParser();
    });

    afterEach(() => {
        for (const f of tempFiles) {
            try {
                fs.rmSync(path.dirname(f), { recursive: true, force: true });
            } catch { /* best effort */ }
        }
        tempFiles.length = 0;
    });

    function makeSession(entries: JsonlEntry[]): string {
        const f = writeSession(entries);
        tempFiles.push(f);
        return f;
    }

    it('strips <system-reminder> blocks from text content', () => {
        const file = makeSession([
            {
                type: 'assistant',
                message: {
                    content: [{
                        type: 'text',
                        text: 'Real response here.\n<system-reminder>\nDo not mention this reminder.\n</system-reminder>\nMore response.',
                    }],
                },
            },
        ]);

        const conv = parser.getConversation(file);
        expect(conv).toHaveLength(1);
        expect(conv[0].content).toBe('Real response here.\n\nMore response.');
    });

    it('strips <local-command-stdout> blocks', () => {
        const file = makeSession([
            {
                type: 'system',
                message: { content: 'before <local-command-stdout>\nRunning...\nDone\n</local-command-stdout> after' },
            },
        ]);

        const conv = parser.getConversation(file);
        expect(conv[0].content).toBe('before  after');
    });

    it('strips <user-prompt-submit-hook> blocks', () => {
        const file = makeSession([
            {
                type: 'user',
                message: { content: '<user-prompt-submit-hook>hook output</user-prompt-submit-hook>\nactual question' },
            },
        ]);

        const conv = parser.getConversation(file);
        expect(conv[0].content).toBe('actual question');
    });

    it('strips bash and command stdout/stderr blocks', () => {
        const file = makeSession([
            {
                type: 'assistant',
                message: {
                    content: [{
                        type: 'text',
                        text: 'Output:\n<bash-input>ls</bash-input>\n<bash-stdout>file.txt</bash-stdout>\n<bash-stderr></bash-stderr>\n<command-stdout>x</command-stdout>\n<command-stderr>y</command-stderr>\nEnd.',
                    }],
                },
            },
        ]);

        const conv = parser.getConversation(file);
        expect(conv[0].content).toBe('Output:\n\n\n\n\n\nEnd.'.replace(/\n{3,}/g, '\n\n'));
        expect(conv[0].content).not.toMatch(/<bash-/);
        expect(conv[0].content).not.toMatch(/<command-stdout>|<command-stderr>/);
    });

    it('collapses <command-name>/<command-args> into "/name args" shorthand', () => {
        const file = makeSession([
            {
                type: 'user',
                message: {
                    content: '<command-message>debug</command-message>\n<command-name>/debug</command-name>\n<command-args>fix the bug</command-args>',
                },
            },
        ]);

        const conv = parser.getConversation(file);
        expect(conv[0].content).toBe('/debug fix the bug');
    });

    it('handles <command-name> without <command-args>', () => {
        const file = makeSession([
            {
                type: 'user',
                message: {
                    content: '<command-message>clear</command-message>\n<command-name>/clear</command-name>',
                },
            },
        ]);

        const conv = parser.getConversation(file);
        expect(conv[0].content).toBe('/clear');
    });

    it('handles multiple harness tags mixed together', () => {
        const file = makeSession([
            {
                type: 'user',
                message: {
                    content: [{
                        type: 'text',
                        text: '<system-reminder>ignore me</system-reminder>\n<command-message>build</command-message>\n<command-name>/build</command-name>\n<command-args>--watch</command-args>\n<local-command-stdout>build output here</local-command-stdout>',
                    }],
                },
            },
        ]);

        const conv = parser.getConversation(file);
        expect(conv[0].content).toBe('/build --watch');
    });

    it('leaves text without harness tags unchanged', () => {
        const file = makeSession([
            {
                type: 'assistant',
                message: { content: [{ type: 'text', text: 'Hello, world!' }] },
            },
        ]);

        const conv = parser.getConversation(file);
        expect(conv[0].content).toBe('Hello, world!');
    });

    it('drops a message that becomes empty after stripping', () => {
        const file = makeSession([
            {
                type: 'system',
                message: { content: '<system-reminder>only this</system-reminder>' },
            },
            {
                type: 'assistant',
                message: { content: [{ type: 'text', text: 'kept' }] },
            },
        ]);

        const conv = parser.getConversation(file);
        expect(conv).toHaveLength(1);
        expect(conv[0].content).toBe('kept');
    });

    it('strips tags spanning multiple lines', () => {
        const multilineReminder = '<system-reminder>\nLine 1\nLine 2\nLine 3\n</system-reminder>';
        const file = makeSession([
            {
                type: 'assistant',
                message: { content: [{ type: 'text', text: `before\n${multilineReminder}\nafter` }] },
            },
        ]);

        const conv = parser.getConversation(file);
        expect(conv[0].content).toBe('before\n\nafter');
    });
});

describe('ClaudeSessionParser.readSession — UI-state entries ignored for status', () => {
    let parser: ClaudeSessionParser;
    const tempFiles: string[] = [];

    beforeEach(() => {
        parser = new ClaudeSessionParser();
    });

    afterEach(() => {
        for (const f of tempFiles) {
            try {
                fs.rmSync(path.dirname(f), { recursive: true, force: true });
            } catch { /* best effort */ }
        }
        tempFiles.length = 0;
    });

    function writeRawSession(lines: object[]): string {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-status-'));
        const filePath = path.join(dir, 'session.jsonl');
        fs.writeFileSync(filePath, lines.map(l => JSON.stringify(l)).join('\n'));
        tempFiles.push(filePath);
        return filePath;
    }

    const uiStateTypes = [
        'attachment',
        'permission-mode',
        'ai-title',
        'queued_command',
        'tools_changed',
        'model_changed',
        'hook_progress',
    ];

    for (const uiType of uiStateTypes) {
        it(`keeps lastEntryType from previous conversation turn when trailing entry is ${uiType}`, () => {
            const file = writeRawSession([
                { type: 'user', timestamp: '2026-05-30T06:17:57.189Z', message: { content: 'hello' } },
                { type: uiType, timestamp: '2026-05-30T06:17:57.201Z' },
            ]);

            const session = parser.readSession(file, '/test');
            expect(session?.lastEntryType).toBe('user');
        });
    }

    it('keeps lastEntryType from a user turn even with multiple trailing UI-state entries', () => {
        const file = writeRawSession([
            { type: 'user', timestamp: '2026-05-30T06:17:57.189Z', message: { content: 'hello' } },
            { type: 'attachment', timestamp: '2026-05-30T06:17:57.200Z', attachment: { type: 'task_reminder', content: [] } },
            { type: 'permission-mode', timestamp: '2026-05-30T06:17:57.210Z', permissionMode: 'default' },
            { type: 'ai-title', timestamp: '2026-05-30T06:17:57.220Z' },
        ]);

        const session = parser.readSession(file, '/test');
        expect(session?.lastEntryType).toBe('user');
    });

    it('keeps lastEntryType from assistant turn when followed by UI-state events', () => {
        const file = writeRawSession([
            { type: 'user', timestamp: '2026-05-30T06:17:00.000Z', message: { content: 'go' } },
            { type: 'assistant', timestamp: '2026-05-30T06:17:01.000Z', message: { content: [{ type: 'text', text: 'done' }] } },
            { type: 'permission-mode', timestamp: '2026-05-30T06:17:02.000Z', permissionMode: 'default' },
        ]);

        const session = parser.readSession(file, '/test');
        expect(session?.lastEntryType).toBe('assistant');
    });
});
