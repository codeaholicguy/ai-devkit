import { randomBytes, timingSafeEqual } from 'node:crypto';

interface PairingSessionOptions {
    code?: string;
    now?: () => number;
    ttlMs?: number;
}

export class SlackPairingSession {
    readonly code: string;
    private readonly expiresAt: number;
    private readonly now: () => number;
    private consumed = false;

    constructor(options: PairingSessionOptions = {}) {
        this.now = options.now ?? Date.now;
        this.code = options.code ?? randomBytes(6).toString('hex').toUpperCase();
        this.expiresAt = this.now() + (options.ttlMs ?? 10 * 60 * 1000);
    }

    consume(candidate: string): boolean {
        if (this.consumed || this.isExpired()) return false;
        const expected = Buffer.from(this.code);
        const actual = Buffer.from(candidate.trim());
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
        this.consumed = true;
        return true;
    }

    isExpired(): boolean {
        return this.now() > this.expiresAt;
    }
}
