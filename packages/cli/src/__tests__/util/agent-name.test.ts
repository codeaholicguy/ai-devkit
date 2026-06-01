import { describe, expect, it, vi, afterEach } from 'vitest';
import { generateAgentName } from '../../util/agent.js';

describe('generateAgentName', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('uses a sanitized cwd folder and base36 timestamp', () => {
        vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));

        expect(generateAgentName('/tmp/My App!!')).toBe(`my-app-${Date.now().toString(36)}`);
    });

    it('falls back to agent when cwd folder has no alphanumeric characters', () => {
        vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));

        expect(generateAgentName('/tmp/---')).toBe(`agent-${Date.now().toString(36)}`);
    });

    it('limits long sanitized folder names before appending the timestamp', () => {
        vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));

        const prefix = 'a'.repeat(50);
        expect(generateAgentName(`/tmp/${'a'.repeat(80)}`)).toBe(`${prefix}-${Date.now().toString(36)}`);
    });
});
