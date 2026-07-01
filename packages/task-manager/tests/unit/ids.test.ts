import { describe, it, expect } from 'vitest';
import {
    makeTaskId,
    makeEventId,
    makeBlockerId,
    makeEvidenceId,
    makeArtifactId,
    nowIso,
} from '../../src/task.ids.js';

// A UUID v4 body (crypto.randomUUID() output): 8-4-4-4-12 lowercase hex digits.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('id generation', () => {
    it('generates a task id as a raw UUIDv4', () => {
        expect(makeTaskId()).toMatch(UUID);
    });

    it('generates all id kinds as raw UUIDv4', () => {
        expect(makeEventId()).toMatch(UUID);
        expect(makeBlockerId()).toMatch(UUID);
        expect(makeEvidenceId()).toMatch(UUID);
        expect(makeArtifactId()).toMatch(UUID);
    });

    it('nowIso returns a valid ISO 8601 string', () => {
        expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
});
