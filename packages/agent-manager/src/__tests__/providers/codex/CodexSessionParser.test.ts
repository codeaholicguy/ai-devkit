import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgentStatus } from '../../../adapters/AgentAdapter.js';
import { CodexSessionParser } from '../../../providers/codex/CodexSessionParser.js';

describe('CodexSessionParser', () => {
    let tmpDir: string;
    let parser: CodexSessionParser;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-parser-'));
        parser = new CodexSessionParser();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reads session metadata, summary, timestamps, and status signal', () => {
        const filePath = writeJsonl('session.jsonl', [
            { type: 'session_meta', payload: { id: 'sess-1', timestamp: '2026-03-18T15:00:00Z', cwd: '/repo' } },
            { type: 'event', timestamp: '2026-03-18T15:01:00Z', payload: { type: 'agent_reasoning', message: 'Working on feature' } },
        ]);

        const session = parser.readSession(filePath);

        expect(session).toMatchObject({
            sessionId: 'sess-1',
            projectPath: '/repo',
            summary: 'Working on feature',
            lastPayloadType: 'agent_reasoning',
        });
        expect(session?.sessionStart.toISOString()).toBe('2026-03-18T15:00:00.000Z');
        expect(parser.determineStatus(session!)).toBe(AgentStatus.IDLE);
    });

    it('reads current response_item and event_msg messages without mirrored duplicates', () => {
        const filePath = writeJsonl('conversation.jsonl', [
            { type: 'session_meta', payload: { id: 'sess-1', cwd: '/repo', timestamp: '2026-03-27T10:00:00Z' } },
            {
                type: 'response_item',
                timestamp: '2026-03-27T10:00:01Z',
                payload: {
                    type: 'message',
                    role: 'user',
                    content: [{ type: 'input_text', text: 'Fix the bug' }],
                    internal_chat_message_metadata_passthrough: { turn_id: 'turn-1' },
                },
            },
            {
                type: 'event_msg',
                timestamp: '2026-03-27T10:00:01.001Z',
                payload: {
                    type: 'item_completed',
                    turn_id: 'turn-1',
                    item: { type: 'UserMessage', content: [{ type: 'text', text: 'Fix the bug' }] },
                },
            },
            {
                type: 'event_msg',
                timestamp: '2026-03-27T10:00:05Z',
                payload: {
                    type: 'item_completed',
                    turn_id: 'turn-1',
                    item: { type: 'AgentMessage', content: [{ type: 'Text', text: 'I found the issue' }] },
                },
            },
            {
                type: 'response_item',
                timestamp: '2026-03-27T10:00:05.005Z',
                payload: {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'I found the issue' }],
                    internal_chat_message_metadata_passthrough: { turn_id: 'turn-1' },
                },
            },
        ]);

        expect(parser.getConversation(filePath)).toEqual([
            { role: 'user', content: 'Fix the bug', timestamp: '2026-03-27T10:00:01Z' },
            { role: 'assistant', content: 'I found the issue', timestamp: '2026-03-27T10:00:05.005Z' },
        ]);
    });

    it('maps completed assistant messages as waiting while recent active events stay running', () => {
        const waiting = parser.readSession('unused.jsonl', [
            JSON.stringify({ type: 'session_meta', payload: { id: 'waiting', timestamp: new Date().toISOString(), cwd: '/repo' } }),
            JSON.stringify({
                type: 'event_msg',
                timestamp: new Date().toISOString(),
                payload: {
                    type: 'item_completed',
                    item: { type: 'AgentMessage', content: [{ type: 'Text', text: 'Waiting for the user now' }] },
                },
            }),
        ].join('\n'));

        const running = parser.readSession('unused.jsonl', [
            JSON.stringify({ type: 'session_meta', payload: { id: 'running', timestamp: new Date().toISOString(), cwd: '/repo' } }),
            JSON.stringify({ type: 'event', timestamp: new Date().toISOString(), payload: { type: 'token_count', message: 'Working' } }),
        ].join('\n'));

        expect(waiting?.summary).toBe('Waiting for the user now');
        expect(parser.determineStatus(waiting!)).toBe(AgentStatus.WAITING);
        expect(parser.determineStatus(running!)).toBe(AgentStatus.RUNNING);
    });

    it('builds historical summaries from the first non-synthetic user message', () => {
        const filePath = writeJsonl('summary.jsonl', [
            { type: 'session_meta', payload: { id: 'summary', cwd: '/repo', timestamp: '2025-01-01T00:00:00Z' } },
            {
                type: 'response_item',
                timestamp: '2025-01-01T00:00:00.500Z',
                payload: {
                    type: 'message',
                    role: 'user',
                    content: [{ type: 'input_text', text: '<environment_context>\n  <cwd>/repo</cwd>\n</environment_context>' }],
                },
            },
            {
                type: 'event_msg',
                timestamp: '2025-01-01T00:00:02Z',
                payload: {
                    type: 'item_completed',
                    item: { type: 'UserMessage', content: [{ type: 'text', text: 'first event user' }] },
                },
            },
        ]);

        expect(parser.fileToSessionSummary(filePath)).toMatchObject({
            type: 'codex',
            sessionId: 'summary',
            cwd: '/repo',
            firstUserMessage: 'first event user',
            sessionFilePath: filePath,
        });
    });

    it('returns null or empty results for unreadable and malformed inputs', () => {
        expect(parser.readSession(path.join(tmpDir, 'missing.jsonl'))).toBeNull();
        expect(parser.readSession('unused.jsonl', '')).toBeNull();
        expect(parser.readSession('unused.jsonl', JSON.stringify({ type: 'event', payload: {} }))).toBeNull();
        expect(parser.getConversation(path.join(tmpDir, 'missing.jsonl'))).toEqual([]);
    });

    function writeJsonl(name: string, entries: object[]): string {
        const filePath = path.join(tmpDir, name);
        fs.writeFileSync(filePath, entries.map((entry) => JSON.stringify(entry)).join('\n'));
        return filePath;
    }
});
