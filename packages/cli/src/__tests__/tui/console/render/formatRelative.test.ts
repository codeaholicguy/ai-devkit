import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatRelative } from '../../../../tui/console/render/formatRelative.js';

describe('formatRelative', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    });
    afterEach(() => { vi.useRealTimers(); });

    it('returns "—" for undefined', () => {
        expect(formatRelative(undefined)).toBe('—');
    });

    it('returns "now" for timestamps within 5 seconds', () => {
        expect(formatRelative(new Date('2026-01-01T11:59:56Z'))).toBe('now');
        expect(formatRelative(new Date('2026-01-01T12:00:00Z'))).toBe('now');
    });

    it('returns seconds for 5–59s ago', () => {
        expect(formatRelative(new Date('2026-01-01T11:59:55Z'))).toBe('5s ago');
        expect(formatRelative(new Date('2026-01-01T11:59:01Z'))).toBe('59s ago');
    });

    it('returns minutes for 1–59m ago', () => {
        expect(formatRelative(new Date('2026-01-01T11:59:00Z'))).toBe('1m ago');
        expect(formatRelative(new Date('2026-01-01T11:01:00Z'))).toBe('59m ago');
    });

    it('returns hours for 1–23h ago', () => {
        expect(formatRelative(new Date('2026-01-01T11:00:00Z'))).toBe('1h ago');
        expect(formatRelative(new Date('2025-12-31T13:00:00Z'))).toBe('23h ago');
    });

    it('returns days for ≥24h ago', () => {
        expect(formatRelative(new Date('2025-12-31T12:00:00Z'))).toBe('1d ago');
        expect(formatRelative(new Date('2025-12-25T12:00:00Z'))).toBe('7d ago');
    });

    it('accepts a string timestamp', () => {
        expect(formatRelative('2026-01-01T11:59:55Z')).toBe('5s ago');
    });

    it('clamps negative diff to now', () => {
        // future date — diff is negative, clamped to 0 → "now"
        expect(formatRelative(new Date('2026-01-01T12:00:01Z'))).toBe('now');
    });
});
