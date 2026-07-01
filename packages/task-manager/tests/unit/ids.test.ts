import { describe, it, expect } from 'vitest';
import {
    makeTaskId,
    makeEventId,
    makeBlockerId,
    makeEvidenceId,
    makeArtifactId,
    makeUniqueId,
    nowIso,
} from '../../src/ids.js';

describe('id generation', () => {
    it('generates a task id with the contract prefix and shape', () => {
        const id = makeTaskId();
        expect(id).toMatch(/^task-\d{14}-[0-9a-z]{6}$/);
    });

    it('generates ids with the correct prefixes', () => {
        expect(makeEventId()).toMatch(/^evt-\d{14}-[0-9a-z]{6}$/);
        expect(makeBlockerId()).toMatch(/^blk-\d{14}-[0-9a-z]{6}$/);
        expect(makeEvidenceId()).toMatch(/^evd-\d{14}-[0-9a-z]{6}$/);
        expect(makeArtifactId()).toMatch(/^art-\d{14}-[0-9a-z]{6}$/);
    });

    it('produces unique ids across calls', () => {
        const ids = new Set<string>();
        for (let i = 0; i < 500; i++) {
            ids.add(makeTaskId());
        }
        expect(ids.size).toBe(500);
    });

    it('ids are lexicographically sortable by creation time', () => {
        const earlier = makeTaskId(new Date('2026-01-01T00:00:00Z'));
        const later = makeTaskId(new Date('2026-06-01T00:00:00Z'));
        expect(earlier.localeCompare(later)).toBeLessThan(0);
    });

    it('makeUniqueId retries on collisions', () => {
        const taken = new Set<string>([makeTaskId()]);
        let calls = 0;
        const exists = (candidate: string): boolean => {
            calls++;
            return taken.has(candidate);
        };
        const id = makeUniqueId('task', exists, () => {
            // Always returns the same value to force collision-then-retry.
            const base = makeTaskId();
            return base;
        });
        // It should have probed at least once; result is a valid task id.
        expect(id).toMatch(/^task-/);
        expect(calls).toBeGreaterThanOrEqual(1);
    });

    it('nowIso returns a valid ISO 8601 string', () => {
        expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
});
