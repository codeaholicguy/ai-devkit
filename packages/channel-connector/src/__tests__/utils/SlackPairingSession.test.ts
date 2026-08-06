import { SlackPairingSession } from '../../utils/SlackPairingSession.js';

describe('SlackPairingSession', () => {
    it('generates a non-trivial pairing code and consumes one exact match', () => {
        const session = new SlackPairingSession({ now: () => 1000 });
        expect(session.code).toMatch(/^[A-Z0-9]{12}$/);
        expect(session.consume(`${session.code}x`)).toBe(false);
        expect(session.consume(session.code)).toBe(true);
        expect(session.consume(session.code)).toBe(false);
    });

    it('expires after ten minutes', () => {
        let now = 1000;
        const session = new SlackPairingSession({ now: () => now, code: 'ABCDEF123456' });
        now += 10 * 60 * 1000 + 1;
        expect(session.consume('ABCDEF123456')).toBe(false);
        expect(session.isExpired()).toBe(true);
    });

    it('normalizes surrounding whitespace but not letter case', () => {
        const session = new SlackPairingSession({ code: 'ABCDEF123456' });
        expect(session.consume('  ABCDEF123456\n')).toBe(true);
        const second = new SlackPairingSession({ code: 'ABCDEF123456' });
        expect(second.consume('abcdef123456')).toBe(false);
    });
});
