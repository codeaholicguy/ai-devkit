import { randomUUID } from 'crypto';

/**
 * Id generation + ISO timestamps.
 *
 * Ids are raw UUIDv4 strings from Node's cryptographic `crypto.randomUUID()`
 * (stored in SQLite as TEXT), generated in the service layer. UUIDs are globally
 * unique, so there are no prefixes, suffixes, or collision checks. Callers should
 * treat ids as opaque strings and match by exact value or a unique prefix.
 */

export function nowIso(now: Date = new Date()): string {
    return now.toISOString();
}

export function makeTaskId(): string {
    return randomUUID();
}

export function makeEventId(): string {
    return randomUUID();
}

export function makeBlockerId(): string {
    return randomUUID();
}

export function makeEvidenceId(): string {
    return randomUUID();
}

export function makeArtifactId(): string {
    return randomUUID();
}
