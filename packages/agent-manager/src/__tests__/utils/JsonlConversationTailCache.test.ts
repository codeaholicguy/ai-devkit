import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConversationMessage } from '../../adapters/AgentAdapter.js';
import {
    JsonlConversationTailCache,
    type JsonlConversationReducer,
} from '../../utils/JsonlConversationTailCache.js';

interface TestState {
    messages: ConversationMessage[];
}

const reducer: JsonlConversationReducer<TestState> = {
    createState: () => ({ messages: [] }),
    processRecord(state, record) {
        const value = record as { role?: ConversationMessage['role']; content?: string };
        if (value.role && value.content) state.messages.push({ role: value.role, content: value.content });
    },
    getMessages: state => state.messages,
};

const line = (content: string): string => JSON.stringify({ role: 'user', content });

describe('JsonlConversationTailCache', () => {
    let dir: string;
    let filePath: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-tail-'));
        filePath = path.join(dir, 'session.jsonl');
    });

    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('processes every byte and complete record once, then serves an unchanged cache hit', async () => {
        const content = `${line('one')}\n${line('two')}\n`;
        fs.writeFileSync(filePath, content);
        const cache = new JsonlConversationTailCache();

        const initial = await cache.read({ key: 'test', filePath, limit: 20, reducer });
        expect(initial.messages.map(message => message.content)).toEqual(['one', 'two']);
        expect(initial.stats).toMatchObject({
            bytesRead: Buffer.byteLength(content),
            recordsProcessed: 2,
            parseErrors: 0,
            cacheHit: false,
            resetReason: 'initial',
        });

        const unchanged = await cache.read({ key: 'test', filePath, limit: 20, reducer });
        expect(unchanged.messages).toEqual(initial.messages);
        expect(unchanged.stats).toMatchObject({
            bytesRead: 0,
            recordsProcessed: 0,
            parseErrors: 0,
            cacheHit: true,
            resetReason: null,
        });
    });

    it('reads only appended bytes and retains only the requested tail', async () => {
        const initial = `${line('one')}\n${line('two')}\n`;
        const appended = `${line('three')}\n${line('four')}\n`;
        fs.writeFileSync(filePath, initial);
        const cache = new JsonlConversationTailCache();
        await cache.read({ key: 'test', filePath, limit: 3, reducer });

        fs.appendFileSync(filePath, appended);
        const result = await cache.read({ key: 'test', filePath, limit: 3, reducer });

        expect(result.messages.map(message => message.content)).toEqual(['two', 'three', 'four']);
        expect(result.stats).toMatchObject({
            bytesRead: Buffer.byteLength(appended),
            recordsProcessed: 2,
            cacheHit: false,
            resetReason: null,
        });
    });

    it('buffers a partial final record without parsing it until a newline arrives', async () => {
        const complete = `${line('one')}\n`;
        const partial = line('two');
        const split = partial.length - 4;
        fs.writeFileSync(filePath, complete + partial.slice(0, split));
        const cache = new JsonlConversationTailCache();

        const first = await cache.read({ key: 'test', filePath, limit: 20, reducer });
        expect(first.messages.map(message => message.content)).toEqual(['one']);
        expect(first.stats).toMatchObject({ recordsProcessed: 1, parseErrors: 0 });

        const suffix = `${partial.slice(split)}\n`;
        fs.appendFileSync(filePath, suffix);
        const second = await cache.read({ key: 'test', filePath, limit: 20, reducer });
        expect(second.messages.map(message => message.content)).toEqual(['one', 'two']);
        expect(second.stats).toMatchObject({
            bytesRead: Buffer.byteLength(suffix),
            recordsProcessed: 1,
            parseErrors: 0,
        });
    });

    it('counts malformed complete records and continues with later records', async () => {
        const content = `${line('one')}\nnot-json\n${line('two')}\n`;
        fs.writeFileSync(filePath, content);
        const result = await new JsonlConversationTailCache().read({ key: 'test', filePath, limit: 20, reducer });

        expect(result.messages.map(message => message.content)).toEqual(['one', 'two']);
        expect(result.stats).toMatchObject({ recordsProcessed: 3, parseErrors: 1 });
    });

    it('rebuilds from byte zero after truncation', async () => {
        fs.writeFileSync(filePath, `${line('old-one')}\n${line('old-two')}\n`);
        const cache = new JsonlConversationTailCache();
        await cache.read({ key: 'test', filePath, limit: 20, reducer });

        const replacement = `${line('new')}\n`;
        fs.truncateSync(filePath, 0);
        fs.writeFileSync(filePath, replacement);
        const result = await cache.read({ key: 'test', filePath, limit: 20, reducer });

        expect(result.messages.map(message => message.content)).toEqual(['new']);
        expect(result.stats).toMatchObject({
            bytesRead: Buffer.byteLength(replacement),
            recordsProcessed: 1,
            resetReason: 'truncated',
        });
    });

    it('rebuilds after an in-place rewrite that ends at the same byte length', async () => {
        const original = `${line('old')}\n`;
        const replacement = `${line('new')}\n`;
        expect(Buffer.byteLength(replacement)).toBe(Buffer.byteLength(original));
        fs.writeFileSync(filePath, original);
        const cache = new JsonlConversationTailCache();
        await cache.read({ key: 'test', filePath, limit: 20, reducer });

        fs.writeFileSync(filePath, replacement);
        const future = new Date(Date.now() + 2000);
        fs.utimesSync(filePath, future, future);
        const result = await cache.read({ key: 'test', filePath, limit: 20, reducer });

        expect(result.messages.map(message => message.content)).toEqual(['new']);
        expect(result.stats).toMatchObject({
            bytesRead: Buffer.byteLength(replacement),
            recordsProcessed: 1,
            resetReason: 'truncated',
        });
    });

    it('rebuilds when replacement or rotation changes file identity', async () => {
        fs.writeFileSync(filePath, `${line('old')}\n`);
        const cache = new JsonlConversationTailCache();
        await cache.read({ key: 'test', filePath, limit: 20, reducer });

        const rotated = path.join(dir, 'rotated.jsonl');
        const replacement = `${line('replacement')}\n`;
        fs.writeFileSync(rotated, replacement);
        fs.renameSync(rotated, filePath);
        const result = await cache.read({ key: 'test', filePath, limit: 20, reducer });

        expect(result.messages.map(message => message.content)).toEqual(['replacement']);
        expect(result.stats).toMatchObject({
            bytesRead: Buffer.byteLength(replacement),
            resetReason: 'identity-changed',
        });
    });

    it('processes only one appended record after a synthetic large initial fixture', async () => {
        const records = Array.from({ length: 20_000 }, (_, index) => `${line(`message-${index}`)}\n`);
        const initial = records.join('');
        fs.writeFileSync(filePath, initial);
        const cache = new JsonlConversationTailCache();
        const first = await cache.read({ key: 'test', filePath, limit: 20, reducer });
        expect(first.stats).toMatchObject({ bytesRead: Buffer.byteLength(initial), recordsProcessed: 20_000 });

        const appended = `${line('appended')}\n`;
        fs.appendFileSync(filePath, appended);
        const second = await cache.read({ key: 'test', filePath, limit: 20, reducer });
        expect(second.stats).toMatchObject({ bytesRead: Buffer.byteLength(appended), recordsProcessed: 1 });
        expect(second.messages.at(-1)?.content).toBe('appended');
    });

    it('evicts the least-recently-used entry at capacity', async () => {
        const cache = new JsonlConversationTailCache({ maxEntries: 2 });
        const paths = ['a', 'b', 'c'].map(name => path.join(dir, `${name}.jsonl`));
        paths.forEach((target, index) => fs.writeFileSync(target, `${line(String(index))}\n`));

        await cache.read({ key: 'a', filePath: paths[0], limit: 20, reducer });
        await cache.read({ key: 'b', filePath: paths[1], limit: 20, reducer });
        await cache.read({ key: 'a', filePath: paths[0], limit: 20, reducer });
        await cache.read({ key: 'c', filePath: paths[2], limit: 20, reducer });
        const rebuilt = await cache.read({ key: 'b', filePath: paths[1], limit: 20, reducer });

        expect(rebuilt.stats.resetReason).toBe('initial');
        expect(rebuilt.stats.bytesRead).toBe(fs.statSync(paths[1]).size);
    });
});
