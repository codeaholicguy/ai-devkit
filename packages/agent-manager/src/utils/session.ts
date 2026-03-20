/**
 * Session File Utilities
 *
 * Shell command wrappers for discovering session files and their birth times.
 * Uses `stat` to get exact epoch-second birth timestamps without reading file contents.
 */

import * as path from 'path';
import { execSync } from 'child_process';

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
 * Get birth times for .jsonl session files across multiple directories in a single shell call.
 *
 * Combines all directory globs into one `stat` command to avoid per-directory exec overhead.
 * Returns empty array if no directories have .jsonl files or command fails.
 * resolvedCwd is left empty — the adapter must set it.
 */
export function batchGetSessionFileBirthtimes(dirs: string[]): SessionFile[] {
    if (dirs.length === 0) return [];

    try {
        const isMacOS = process.platform === 'darwin';
        const globs = dirs.map((d) => `"${d}"/*.jsonl`).join(' ');
        // || true prevents non-zero exit when some globs have no .jsonl matches
        const command = isMacOS
            ? `stat -f '%B %N' ${globs} 2>/dev/null || true`
            : `stat --format='%W %n' ${globs} 2>/dev/null || true`;

        const output = execSync(command, { encoding: 'utf-8' });

        return parseStatOutput(output);
    } catch {
        return [];
    }
}

/**
 * Parse stat output lines into SessionFile entries.
 */
function parseStatOutput(output: string): SessionFile[] {
    const results: SessionFile[] = [];

    for (const rawLine of output.trim().split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;

        // Format: "<epoch_seconds> <filepath>"
        const spaceIdx = line.indexOf(' ');
        if (spaceIdx === -1) continue;

        const epochStr = line.slice(0, spaceIdx);
        const filePath = line.slice(spaceIdx + 1).trim();

        const epochSeconds = parseInt(epochStr, 10);
        if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) continue;

        const fileName = path.basename(filePath);
        if (!fileName.endsWith('.jsonl')) continue;

        const sessionId = fileName.replace(/\.jsonl$/, '');

        results.push({
            sessionId,
            filePath,
            projectDir: path.dirname(filePath),
            birthtimeMs: epochSeconds * 1000,
            resolvedCwd: '',
        });
    }

    return results;
}
