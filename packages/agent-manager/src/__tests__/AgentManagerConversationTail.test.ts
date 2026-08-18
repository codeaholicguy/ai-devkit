import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentManager } from '../AgentManager.js';
import type {
    AgentAdapter,
    ConversationMessage,
    ConversationTailResult,
} from '../adapters/AgentAdapter.js';

const messages = (...contents: string[]): ConversationMessage[] =>
    contents.map(content => ({ role: 'user', content }));

function makeAdapter(overrides: Partial<AgentAdapter> = {}): AgentAdapter {
    return {
        type: 'other',
        detectAgents: async () => [],
        canHandle: () => false,
        getConversation: () => [],
        listSessions: async () => [],
        ...overrides,
    };
}

describe('AgentManager.getConversationTail', () => {
    let dir: string;
    let filePath: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manager-tail-'));
        filePath = path.join(dir, 'session.jsonl');
        fs.writeFileSync(filePath, '{}\n');
    });

    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('delegates to an optimized adapter reader and enforces the requested tail bound', async () => {
        const optimized = vi.fn(async (): Promise<ConversationTailResult> => ({
            messages: messages('one', 'two', 'three'),
            stats: {
                bytesRead: 3,
                recordsProcessed: 3,
                parseErrors: 0,
                cacheHit: false,
                resetReason: 'initial',
            },
        }));
        const manager = new AgentManager();
        manager.registerAdapter(makeAdapter({ getConversationTail: optimized }));

        const result = await manager.getConversationTail('other', filePath, { limit: 2 });

        expect(optimized).toHaveBeenCalledWith(filePath, { limit: 2 });
        expect(result.messages.map(message => message.content)).toEqual(['two', 'three']);
    });

    it('defers the legacy fallback and caches an unchanged real file', async () => {
        let invoked = false;
        const legacy = vi.fn(() => {
            invoked = true;
            return messages('one', 'two', 'three');
        });
        const manager = new AgentManager();
        manager.registerAdapter(makeAdapter({ getConversation: legacy }));

        const pending = manager.getConversationTail('other', filePath, { limit: 2 });
        expect(invoked).toBe(false);
        const first = await pending;
        expect(first.messages.map(message => message.content)).toEqual(['two', 'three']);
        expect(first.stats.cacheHit).toBe(false);

        const second = await manager.getConversationTail('other', filePath, { limit: 2 });
        expect(second.messages).toEqual(first.messages);
        expect(second.stats).toMatchObject({ bytesRead: 0, recordsProcessed: 0, cacheHit: true });
        expect(legacy).toHaveBeenCalledTimes(1);
    });

    it('invalidates the fallback cache after an append', async () => {
        const legacy = vi.fn(() => messages(`read-${fs.statSync(filePath).size}`));
        const manager = new AgentManager();
        manager.registerAdapter(makeAdapter({ getConversation: legacy }));
        await manager.getConversationTail('other', filePath, { limit: 20 });

        fs.appendFileSync(filePath, '{}\n');
        const changed = await manager.getConversationTail('other', filePath, { limit: 20 });

        expect(legacy).toHaveBeenCalledTimes(2);
        expect(changed.stats.cacheHit).toBe(false);
        expect(changed.stats.resetReason).toBeNull();
    });

    it('rejects an unsupported adapter type', async () => {
        const manager = new AgentManager();
        await expect(manager.getConversationTail('codex', filePath, { limit: 20 }))
            .rejects.toThrow('Unsupported agent type: codex');
    });
});
