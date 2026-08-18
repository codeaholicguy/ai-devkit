import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodexAdapter } from '../../adapters/CodexAdapter.js';

const meta = {
    type: 'session_meta',
    payload: { id: 'session-1', cwd: '/repo', timestamp: '2026-08-14T10:00:00Z' },
};

const legacy = (type: 'user_message' | 'agent_message', message: string) => ({
    type: 'event',
    timestamp: '2026-08-14T10:00:01Z',
    payload: { type, message },
});

const response = (role: 'user' | 'assistant', content: string, turnId: string) => ({
    type: 'response_item',
    timestamp: '2026-08-14T10:00:03Z',
    payload: {
        type: 'message',
        role,
        content: [{ type: role === 'user' ? 'input_text' : 'output_text', text: content }],
        internal_chat_message_metadata_passthrough: { turn_id: turnId },
    },
});

const eventMirror = (role: 'UserMessage' | 'AgentMessage', content: string, turnId: string) => ({
    type: 'event_msg',
    timestamp: '2026-08-14T10:00:02Z',
    payload: {
        type: 'item_completed',
        turn_id: turnId,
        item: { type: role, content: [{ type: 'Text', text: content }] },
    },
});

const encode = (...records: object[]): string => records.map(record => `${JSON.stringify(record)}\n`).join('');

describe('CodexAdapter.getConversationTail', () => {
    let dir: string;
    let filePath: string;
    let adapter: CodexAdapter;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-tail-'));
        filePath = path.join(dir, 'session.jsonl');
        adapter = new CodexAdapter();
    });

    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('preserves synchronous conversation semantics while reading only appended records', async () => {
        const initial = encode(meta, legacy('user_message', 'question'));
        fs.writeFileSync(filePath, initial);

        const first = await adapter.getConversationTail!(filePath, { limit: 20 });
        expect(first.messages).toEqual(adapter.getConversation(filePath));
        expect(first.stats).toMatchObject({
            bytesRead: Buffer.byteLength(initial),
            recordsProcessed: 2,
            resetReason: 'initial',
        });

        const appended = encode(legacy('agent_message', 'answer'));
        fs.appendFileSync(filePath, appended);
        const second = await adapter.getConversationTail!(filePath, { limit: 20 });
        expect(second.messages).toEqual(adapter.getConversation(filePath));
        expect(second.stats).toMatchObject({
            bytesRead: Buffer.byteLength(appended),
            recordsProcessed: 1,
            resetReason: null,
        });
    });

    it('does not emit a partial appended record before it is completed', async () => {
        fs.writeFileSync(filePath, encode(meta));
        await adapter.getConversationTail!(filePath, { limit: 20 });

        const record = JSON.stringify(legacy('user_message', 'split'));
        fs.appendFileSync(filePath, record.slice(0, -3));
        const partial = await adapter.getConversationTail!(filePath, { limit: 20 });
        expect(partial.messages).toEqual([]);
        expect(partial.stats.recordsProcessed).toBe(0);

        fs.appendFileSync(filePath, `${record.slice(-3)}\n`);
        const complete = await adapter.getConversationTail!(filePath, { limit: 20 });
        expect(complete.messages.map(message => message.content)).toEqual(['split']);
        expect(complete.stats.recordsProcessed).toBe(1);
    });

    it('removes an event mirror when its response item arrives in a later append', async () => {
        fs.writeFileSync(filePath, encode(meta, eventMirror('AgentMessage', 'answer', 'turn-1')));
        const beforeMirror = await adapter.getConversationTail!(filePath, { limit: 20 });
        expect(beforeMirror.messages.map(message => message.content)).toEqual(['answer']);

        fs.appendFileSync(filePath, encode(response('assistant', 'answer', 'turn-1')));
        const afterMirror = await adapter.getConversationTail!(filePath, { limit: 20 });

        expect(afterMirror.messages).toEqual(adapter.getConversation(filePath));
        expect(afterMirror.messages).toHaveLength(1);
        expect(afterMirror.messages[0].timestamp).toBe('2026-08-14T10:00:03Z');
        expect(afterMirror.stats.recordsProcessed).toBe(1);
    });

    it('skips an event mirror appended after its response item', async () => {
        fs.writeFileSync(filePath, encode(meta, response('user', 'question', 'turn-2')));
        await adapter.getConversationTail!(filePath, { limit: 20 });

        fs.appendFileSync(filePath, encode(eventMirror('UserMessage', 'question', 'turn-2')));
        const result = await adapter.getConversationTail!(filePath, { limit: 20 });

        expect(result.messages).toEqual(adapter.getConversation(filePath));
        expect(result.messages).toHaveLength(1);
    });

    it('retains only the requested newest messages', async () => {
        fs.writeFileSync(filePath, encode(meta, ...Array.from({ length: 30 }, (_, index) =>
            legacy(index % 2 === 0 ? 'user_message' : 'agent_message', `message-${index}`),
        )));

        const result = await adapter.getConversationTail!(filePath, { limit: 20 });
        expect(result.messages).toEqual(adapter.getConversation(filePath).slice(-20));
    });
});
