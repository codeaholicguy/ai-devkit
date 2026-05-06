/**
 * Session File Utilities
 *
 * Utilities for discovering session files and their birth times.
 * Uses Node.js fs APIs to get birth timestamps without reading file contents.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents a session file with its birth time metadata.
 */
export interface SessionFile {
    /** Session identifier (filename without .jsonl extension) */
    sessionId: string;

    /** Full path to the session file */
    filePath: string;

    /** Parent directory of the session file */
    projectDir: string;

    /** File creation time in milliseconds since epoch */
    birthtimeMs: number;

    /** CWD this session maps to — set by the adapter after calling batchGetSessionFileBirthtimes() */
    resolvedCwd: string;
}

/**
 * Get birth times for .jsonl session files across multiple directories.
 *
 * Enumerates each directory with readdirSync and stats each .jsonl file
 * to get its birth time. No shell commands are used.
 * Returns empty array if no directories have .jsonl files or reads fail.
 * resolvedCwd is left empty — the adapter must set it.
 */
export function batchGetSessionFileBirthtimes(dirs: string[]): SessionFile[] {
    if (dirs.length === 0) return [];

    const results: SessionFile[] = [];

    for (const dir of dirs) {
        let entries: string[];
        try {
            entries = fs.readdirSync(dir);
        } catch {
            continue;
        }

        for (const entry of entries) {
            if (!entry.endsWith('.jsonl')) continue;

            const filePath = path.join(dir, entry);

            let birthtimeMs: number;
            try {
                birthtimeMs = fs.statSync(filePath).birthtimeMs;
            } catch {
                continue;
            }

            if (!Number.isFinite(birthtimeMs) || birthtimeMs <= 0) continue;

            const sessionId = entry.replace(/\.jsonl$/, '');

            results.push({
                sessionId,
                filePath,
                projectDir: dir,
                birthtimeMs,
                resolvedCwd: '',
            });
        }
    }

    return results;
}
