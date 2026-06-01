import { describe, expect, it } from 'vitest';
import { getKillInputDecision } from '../../../../tui/console/hooks/useKillAgentAction.js';

describe('getKillInputDecision', () => {
    it('does not consume input when no kill is pending', () => {
        expect(getKillInputDecision(null, 'K', {})).toBe('none');
    });

    it('cancels pending kill on Escape or n', () => {
        expect(getKillInputDecision('repo-a', '', { escape: true })).toBe('cancel');
        expect(getKillInputDecision('repo-a', 'n', {})).toBe('cancel');
    });

    it('confirms pending kill on Enter or y', () => {
        expect(getKillInputDecision('repo-a', '', { return: true })).toBe('confirm');
        expect(getKillInputDecision('repo-a', 'y', {})).toBe('confirm');
    });

    it('consumes unrelated input while confirmation is open', () => {
        expect(getKillInputDecision('repo-a', 'j', {})).toBe('consume');
    });
});
