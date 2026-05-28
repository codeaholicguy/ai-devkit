import { describe, it, expect, beforeEach } from 'vitest';
import {
    cacheSet,
    conversationCache,
    CACHE_MAX,
    messagesEqual,
} from '../../../../tui/console/hooks/useAgentConversation.js';
import type { ConversationMessage } from '@ai-devkit/agent-manager';

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
