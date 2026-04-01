/**
 * Session Matching Utilities
 *
 * Shared 1:1 greedy matching algorithm that pairs running processes with session files
 * based on CWD and birth-time proximity to process start time.
 */

import * as path from 'path';
import type { ProcessInfo } from '../adapters/AgentAdapter';
import type { SessionFile } from './session';

/** Maximum allowed delta between process start time and session file birth time. */
const TOLERANCE_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Result of matching a process to a session file.
 */
export interface MatchResult {
    /** The matched process */
    process: ProcessInfo;

    /** The matched session file */
    session: SessionFile;

    /** Absolute time delta in ms between process start and session birth time */
    deltaMs: number;
}

/**
 * Match processes to session files using 1:1 greedy assignment.
 *
 * Algorithm:
 * 1. Exclude processes without startTime (they become process-only fallback).
 * 2. Build candidate pairs where process.cwd === session.resolvedCwd
 *    and |process.startTime - session.birthtimeMs| <= 3 minutes.
 * 3. Sort candidates by deltaMs ascending (best matches first).
 * 4. Greedily assign: once a process or session is matched, skip it.
 *
 * Adapters must set session.resolvedCwd before calling this function.
 */
export function matchProcessesToSessions(
    processes: ProcessInfo[],
    sessions: SessionFile[],
): MatchResult[] {
    // Build all candidate pairs
    const candidates: Array<{ process: ProcessInfo; session: SessionFile; deltaMs: number }> = [];

    for (const proc of processes) {
        if (!proc.startTime || !proc.cwd) continue;

        const processStartMs = proc.startTime.getTime();

        for (const session of sessions) {
            if (!session.resolvedCwd) continue;
            if (proc.cwd !== session.resolvedCwd) continue;

            const deltaMs = Math.abs(processStartMs - session.birthtimeMs);
            if (deltaMs > TOLERANCE_MS) continue;

            candidates.push({ process: proc, session, deltaMs });
        }
    }

    // Sort by smallest delta first
    candidates.sort((a, b) => a.deltaMs - b.deltaMs);

    // Greedy 1:1 assignment
    const matchedPids = new Set<number>();
    const matchedSessionIds = new Set<string>();
    const results: MatchResult[] = [];

    for (const candidate of candidates) {
        if (matchedPids.has(candidate.process.pid)) continue;
        if (matchedSessionIds.has(candidate.session.sessionId)) continue;

        matchedPids.add(candidate.process.pid);
        matchedSessionIds.add(candidate.session.sessionId);
        results.push(candidate);
    }

    return results;
}

/**
 * Generate a deterministic agent name from CWD and PID.
 *
 * Format: "folder-name-pid" (lowercase kebab-case)
 */
export function generateAgentName(cwd: string, pid: number): string {
    const folderName = path.basename(cwd) || 'unknown';
    const kebab = folderName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${kebab || 'unknown'}-${pid}`;
}
