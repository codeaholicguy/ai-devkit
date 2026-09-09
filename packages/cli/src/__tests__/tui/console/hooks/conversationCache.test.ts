import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    cacheSet,
    conversationCache,
    CACHE_MAX,
    messagesEqual,
    ConversationRequestGate,
    loadAgentConversation,
    startConversationPolling,
} from '../../../../tui/console/hooks/useAgentConversation.js';
import type { AgentInfo, AgentManager, ConversationMessage } from '@ai-devkit/agent-manager';

const msg = (role: ConversationMessage['role'], content: string, timestamp?: string): ConversationMessage =>
    ({ role, content, timestamp } as ConversationMessage);

describe('LRU conversation cache', () => {
    beforeEach(() => { conversationCache.clear(); });

    it('stores and retrieves an entry', () => {
        cacheSet('/path/a', { mtime: 1, messages: [msg('user', 'hi')] });
        expect(conversationCache.get('/path/a')).toEqual({ mtime: 1, messages: [msg('user', 'hi')] });
    });

    it('re-inserting an existing key moves it to most-recent (LRU refresh)', () => {
        cacheSet('/path/a', { mtime: 1, messages: [] });
        cacheSet('/path/b', { mtime: 2, messages: [] });
        // refresh /path/a so it becomes most-recent
        cacheSet('/path/a', { mtime: 3, messages: [] });
        // fill to capacity, pushing /path/b out first
        for (let i = 0; i < CACHE_MAX - 1; i++) {
            cacheSet(`/path/${i + 10}`, { mtime: i, messages: [] });
        }
        expect(conversationCache.has('/path/b')).toBe(false);
        expect(conversationCache.has('/path/a')).toBe(true);
    });

    it('evicts oldest entry when size reaches CACHE_MAX', () => {
        for (let i = 0; i < CACHE_MAX; i++) {
            cacheSet(`/path/${i}`, { mtime: i, messages: [] });
        }
        expect(conversationCache.size).toBe(CACHE_MAX);
        // adding one more evicts the oldest (/path/0)
        cacheSet('/path/new', { mtime: 99, messages: [] });
        expect(conversationCache.size).toBe(CACHE_MAX);
        expect(conversationCache.has('/path/0')).toBe(false);
        expect(conversationCache.has('/path/new')).toBe(true);
    });

    it('never exceeds CACHE_MAX even under repeated inserts', () => {
        for (let i = 0; i < CACHE_MAX * 3; i++) {
            cacheSet(`/path/${i}`, { mtime: i, messages: [] });
        }
        expect(conversationCache.size).toBe(CACHE_MAX);
    });
});

describe('messagesEqual', () => {
    it('returns true for two empty arrays', () => {
        expect(messagesEqual([], [])).toBe(true);
    });

    it('returns false when lengths differ', () => {
        expect(messagesEqual([msg('user', 'a')], [])).toBe(false);
    });

    it('returns true when role, content and timestamp match', () => {
        const a = [msg('user', 'hello', '2026-01-01T00:00:00Z')];
        const b = [msg('user', 'hello', '2026-01-01T00:00:00Z')];
        expect(messagesEqual(a, b)).toBe(true);
    });

    it('returns false when role differs', () => {
        expect(messagesEqual([msg('user', 'x')], [msg('assistant', 'x')])).toBe(false);
    });

    it('returns false when content differs', () => {
        expect(messagesEqual([msg('user', 'a')], [msg('user', 'b')])).toBe(false);
    });

    it('returns false when timestamp differs', () => {
        expect(messagesEqual(
            [msg('user', 'x', '2026-01-01T00:00:00Z')],
            [msg('user', 'x', '2026-01-01T00:00:01Z')],
        )).toBe(false);
    });

    it('returns true when both timestamps are undefined', () => {
        expect(messagesEqual([msg('user', 'x')], [msg('user', 'x')])).toBe(true);
    });
});

describe('async conversation requests', () => {
    const agent = {
        name: 'codex-one',
        type: 'codex',
        sessionFilePath: '/tmp/session.jsonl',
    } as AgentInfo;

    afterEach(() => vi.useRealTimers());

    it('rejects a stale selection result after a newer request begins', async () => {
        let resolveFirst!: (value: any) => void;
        let resolveSecond!: (value: any) => void;
        const first = new Promise(resolve => { resolveFirst = resolve; });
        const second = new Promise(resolve => { resolveSecond = resolve; });
        const getConversationTail = vi.fn()
            .mockReturnValueOnce(first)
            .mockReturnValueOnce(second);
        const manager = {
            getAdapter: () => ({}),
            getConversationTail,
        } as unknown as AgentManager;
        const gate = new ConversationRequestGate();

        const firstToken = gate.begin();
        const oldRequest = loadAgentConversation(manager, agent, 20, gate, firstToken);
        const secondToken = gate.begin();
        const newRequest = loadAgentConversation(manager, agent, 20, gate, secondToken);
        resolveSecond({ messages: [msg('assistant', 'new')], stats: {} });
        expect((await newRequest)?.messages.map(message => message.content)).toEqual(['new']);

        resolveFirst({ messages: [msg('assistant', 'old')], stats: {} });
        expect(await oldRequest).toBeNull();
    });

    it('rejects a stale error and retains only the newest 20 messages', async () => {
        let rejectFirst!: (error: Error) => void;
        const first = new Promise((_resolve, reject) => { rejectFirst = reject; });
        const many = Array.from({ length: 30 }, (_, index) => msg('user', `message-${index}`));
        const manager = {
            getAdapter: () => ({}),
            getConversationTail: vi.fn()
                .mockReturnValueOnce(first)
                .mockResolvedValueOnce({ messages: many, stats: {} }),
        } as unknown as AgentManager;
        const gate = new ConversationRequestGate();

        const staleToken = gate.begin();
        const stale = loadAgentConversation(manager, agent, 20, gate, staleToken);
        const currentToken = gate.begin();
        const current = await loadAgentConversation(manager, agent, 20, gate, currentToken);
        expect(current?.messages).toHaveLength(20);
        expect(current?.messages[0].content).toBe('message-10');

        rejectFirst(new Error('old parse failed'));
        expect(await stale).toBeNull();
    });

    it('keeps interval polling as a fallback', async () => {
        vi.useFakeTimers();
        const fetchOnce = vi.fn(async () => undefined);
        const handle = startConversationPolling(fetchOnce, 3000);

        await vi.advanceTimersByTimeAsync(9000);
        clearInterval(handle);

        expect(fetchOnce).toHaveBeenCalledTimes(3);
    });
});
