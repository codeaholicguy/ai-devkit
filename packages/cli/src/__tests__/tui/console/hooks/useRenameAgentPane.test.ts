import { describe, expect, it } from 'vitest';
import { getRenameActionError } from '../../../../tui/console/hooks/useRenameAgentPane.js';

describe('getRenameActionError', () => {
    it('returns explicit subprocess errors', () => {
        expect(getRenameActionError({ exitCode: 1, error: 'name already exists' })).toBe('name already exists');
    });

    it('returns a fallback error for non-zero exits without stderr', () => {
        expect(getRenameActionError({ exitCode: 1 })).toBe('rename exited 1');
    });

    it('returns null for a successful rename result', () => {
        expect(getRenameActionError({ exitCode: 0 })).toBeNull();
    });
});
