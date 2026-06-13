import { describe, expect, it } from 'vitest';
import { AGENTS } from '../../../src/utils/agents.js';

describe('AGENTS', () => {
    it('includes Pi as a startable agent', () => {
        expect(AGENTS.pi.command).toBe('pi');
        expect(AGENTS.pi.matches('pi')).toBe(true);
        expect(AGENTS.pi.matches('/usr/local/bin/pi --model x')).toBe(true);
        expect(AGENTS.pi.matches('node /repo/feature-pi-adapter/script.js')).toBe(false);
    });
});
