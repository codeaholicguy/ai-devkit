import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AgentStatus } from '../../../adapters/AgentAdapter.js';
import { PiSessionParser } from '../../../providers/pi/PiSessionParser.js';

describe('PiSessionParser', () => {
    let tmpDir: string;
    let parser: PiSessionParser;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-parser-test-'));
        parser = new PiSessionParser();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reads session metadata, summary, timestamps, and status signal', () => {
        const filePath = writeJsonl('session.jsonl', [
            { type: 'session_meta', timestamp: '2026-06-10T08:58:20.754Z', sessionId: 'sess-101', cwd: '/repo/project-a' },
            { role: 'user', timestamp: '2026-06-10T08:58:21.000Z', content: 'implement Pi adapter' },
            { role: 'assistant', timestamp: new Date().toISOString(), content: 'working on it' },
        ]);

        const session = parser.readSession(filePath);

        expect(session).toMatchObject({
            sessionId: 'sess-101',
            projectPath: '/repo/project-a',
            summary: 'implement Pi adapter',
            lastRole: 'assistant',
        });
        expect(session?.sessionStart.toISOString()).toBe('2026-06-10T08:58:20.754Z');
        expect(parser.determineStatus(session!)).toBe(AgentStatus.WAITING);
    });

    it('uses the filename session id fallback and reports running when the latest message is from the user', () => {
        const filePath = writeJsonl('plain-session.jsonl', [
            { role: 'user', timestamp: new Date().toISOString(), content: 'still working' },
        ]);

        const session = parser.readSession(filePath);

        expect(session).toMatchObject({
            sessionId: 'plain-session',
            summary: 'still working',
            lastRole: 'user',
        });
        expect(parser.determineStatus(session!)).toBe(AgentStatus.RUNNING);
    });

    it('truncates long user prompts in detected session summaries', () => {
        const longPrompt = 'x'.repeat(140);
        const filePath = writeJsonl('session.jsonl', [
            { type: 'session', timestamp: '2026-06-10T08:58:20.754Z', id: 'sess-long', cwd: '/repo/project-long-summary' },
            { role: 'user', timestamp: '2026-06-10T08:58:21.000Z', content: longPrompt },
        ]);

        const session = parser.readSession(filePath);

        expect(session?.summary).toHaveLength(120);
        expect(session?.summary.endsWith('...')).toBe(true);
    });

    it('reads user and assistant conversation messages from JSONL', () => {
        const filePath = writeJsonl('conversation.jsonl', [
            { role: 'system', timestamp: '2026-06-10T08:58:20.000Z', content: 'hidden' },
            { role: 'user', timestamp: '2026-06-10T08:58:21.000Z', content: 'hello pi' },
            { type: 'assistant', timestamp: '2026-06-10T08:58:22.000Z', message: { content: 'hello human' } },
            '{not json',
        ]);

        expect(parser.getConversation(filePath)).toEqual([
            { role: 'user', content: 'hello pi', timestamp: '2026-06-10T08:58:21.000Z' },
            { role: 'assistant', content: 'hello human', timestamp: '2026-06-10T08:58:22.000Z' },
        ]);
    });

    it('includes system entries only in verbose conversation mode', () => {
        const filePath = writeJsonl('verbose.jsonl', [
            { role: 'system', timestamp: '2026-06-10T08:58:20.000Z', content: 'model changed' },
            { role: 'user', timestamp: '2026-06-10T08:58:21.000Z', content: 'visible' },
        ]);

        expect(parser.getConversation(filePath)).toEqual([
            { role: 'user', content: 'visible', timestamp: '2026-06-10T08:58:21.000Z' },
        ]);
        expect(parser.getConversation(filePath, { verbose: true })).toEqual([
            { role: 'system', content: 'model changed', timestamp: '2026-06-10T08:58:20.000Z' },
            { role: 'user', content: 'visible', timestamp: '2026-06-10T08:58:21.000Z' },
        ]);
    });

    it('reads real Pi message entries with nested role and text parts', () => {
        const filePath = writeJsonl('real.jsonl', [
            { type: 'session', version: 3, id: 'sess-real', timestamp: '2026-06-10T13:27:17.581Z', cwd: '/repo/project-real' },
            { type: 'model_change', id: 'model-1', timestamp: '2026-06-10T13:27:17.655Z', modelId: 'claude-sonnet-4-6' },
            {
                type: 'message',
                id: 'msg-user',
                timestamp: '2026-06-10T13:27:37.975Z',
                message: {
                    role: 'user',
                    content: [{ type: 'text', text: 'hello' }],
                    timestamp: 1781098057974,
                },
            },
            {
                type: 'message',
                id: 'msg-assistant',
                timestamp: '2026-06-10T13:27:40.161Z',
                message: {
                    role: 'assistant',
                    content: [{ type: 'text', text: 'Hello! How can I help you today?' }],
                    provider: 'anthropic',
                    model: 'claude-sonnet-4-6',
                    timestamp: 1781098058012,
                },
            },
        ]);

        expect(parser.getConversation(filePath)).toEqual([
            { role: 'user', content: 'hello', timestamp: '2026-06-10T13:27:37.975Z' },
            { role: 'assistant', content: 'Hello! How can I help you today?', timestamp: '2026-06-10T13:27:40.161Z' },
        ]);
        expect(parser.readSession(filePath)).toMatchObject({
            sessionId: 'sess-real',
            summary: 'hello',
            lastActive: new Date('2026-06-10T13:27:40.161Z'),
        });
    });

    it('builds historical summaries from the first user message', () => {
        const filePath = writeJsonl('summary.jsonl', [
            { timestamp: '2026-06-10T08:58:20.754Z', sessionId: 'sess-g', cwd: '/repo/project-g' },
            { role: 'user', timestamp: '2026-06-10T08:58:21.000Z', content: 'first matching message' },
        ]);

        expect(parser.fileToSessionSummary(filePath)).toMatchObject({
            type: 'pi',
            sessionId: 'sess-g',
            cwd: '/repo/project-g',
            firstUserMessage: 'first matching message',
            sessionFilePath: filePath,
        });
    });

    function writeJsonl(name: string, entries: Array<Record<string, unknown> | string>): string {
        const filePath = path.join(tmpDir, name);
        fs.writeFileSync(
            filePath,
            entries.map((entry) => typeof entry === 'string' ? entry : JSON.stringify(entry)).join('\n'),
        );
        return filePath;
    }
});
