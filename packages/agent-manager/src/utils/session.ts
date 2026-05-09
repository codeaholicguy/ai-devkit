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
 * Check whether a path exists and is a directory.
 * Returns false on any error (missing path, permission denied, broken symlink, etc.).
 */
export function isDirectory(p: string): boolean {
    return safeStat(p)?.isDirectory() ?? false;
}

/**
 * `fs.statSync` that swallows errors and returns `undefined` on failure.
 * Callers can pull whichever fields they need (mtime, birthtime, ...).
 */
export function safeStat(filePath: string): fs.Stats | undefined {
    try {
        return fs.statSync(filePath);
    } catch {
        return undefined;
    }
}

/**
 * `fs.readFileSync` (utf-8) that swallows errors and returns `undefined`
 * on failure. Use when an unreadable file should be skipped rather than
 * raised.
 */
export function safeReadFile(filePath: string): string | undefined {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return undefined;
    }
}

/**
 * `fs.readdirSync` that swallows errors and returns `[]` on failure.
 * Useful when walking optional/transient directories where missing or
 * unreadable entries should be skipped silently.
 */
export function safeReaddir(dir: string): string[] {
    try {
        return fs.readdirSync(dir);
    } catch {
        return [];
    }
}

/**
 * List entries in a directory that end with `.jsonl`. Returns `[]` on
 * read errors. The result preserves directory order (no sorting).
 */
export function listJsonl(dir: string): string[] {
    return safeReaddir(dir).filter((name) => name.endsWith('.jsonl'));
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
