/**
 * Stable id generation + ISO timestamps.
 *
 * Id format: `<prefix>-<YYYYMMDDHHMMSS>-<6 base36>` — lexicographically sortable by
 * creation time, human-readable, and collision-safe via the random suffix.
 *
 * Per the contract, callers should treat ids as opaque strings and match by exact
 * value or unique prefix.
 */

const SUFFIX_LENGTH = 6;
const BASE36_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function timestampStamp(now: Date = new Date()): string {
    const pad = (n: number, len = 2): string => String(n).padStart(len, '0');
    return (
        pad(now.getUTCFullYear(), 4) +
        pad(now.getUTCMonth() + 1) +
        pad(now.getUTCDate()) +
        pad(now.getUTCHours()) +
        pad(now.getUTCMinutes()) +
        pad(now.getUTCSeconds())
    );
}

function randomSuffix(length: number = SUFFIX_LENGTH): string {
    let out = '';
    for (let i = 0; i < length; i++) {
        out += BASE36_ALPHABET[Math.floor(Math.random() * BASE36_ALPHABET.length)];
    }
    return out;
}

/** Current time as an ISO 8601 string. */
export function nowIso(now: Date = new Date()): string {
    return now.toISOString();
}

export function makeTaskId(now?: Date): string {
    return `task-${timestampStamp(now)}-${randomSuffix()}`;
}

export function makeEventId(now?: Date): string {
    return `evt-${timestampStamp(now)}-${randomSuffix()}`;
}

export function makeBlockerId(now?: Date): string {
    return `blk-${timestampStamp(now)}-${randomSuffix()}`;
}

export function makeEvidenceId(now?: Date): string {
    return `evd-${timestampStamp(now)}-${randomSuffix()}`;
}

export function makeArtifactId(now?: Date): string {
    return `art-${timestampStamp(now)}-${randomSuffix()}`;
}

/** Generate an id with collision avoidance against an existence check. */
export function makeUniqueId(
    prefix: string,
    exists: (candidate: string) => boolean,
    make: (now?: Date) => string,
    maxAttempts = 25
): string {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = make();
        if (!exists(candidate)) {
            return candidate;
        }
    }
    // Extremely unlikely; fall back to an extra-long suffix to guarantee uniqueness.
    return `${prefix}-${timestampStamp()}-${randomSuffix(SUFFIX_LENGTH * 2)}`;
}
