/**
 * File Utilities
 * 
 * Helper functions for reading files efficiently
 */

import * as fs from 'fs';

/**
 * Read last N lines from a file efficiently
 * 
 * @param filePath Path to the file
 * @param lineCount Number of lines to read from the end (default: 100)
 * @returns Array of lines
 * 
 * @example
 * ```typescript
 * const lastLines = readLastLines('/path/to/log.txt', 50);
 * ```
 */
export function readLastLines(filePath: string, lineCount: number = 100): string[] {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const allLines = content.trim().split('\n');

        // Return last N lines (or all if file has fewer lines)
        return allLines.slice(-lineCount);
    } catch {
        return [];
    }
}

/**
 * Read a JSONL (JSON Lines) file and parse each line
 * 
 * @param filePath Path to the JSONL file
 * @param maxLines Maximum number of lines to read from end (default: 1000)
 * @returns Array of parsed objects
 * 
 * @example
 * ```typescript
 * const entries = readJsonLines<MyType>('/path/to/data.jsonl');
 * const recent = readJsonLines<MyType>('/path/to/data.jsonl', 100);
 * ```
 */
export function readJsonLines<T = unknown>(filePath: string, maxLines: number = 1000): T[] {
    const lines = readLastLines(filePath, maxLines);

    return lines.map(line => {
        try {
            return JSON.parse(line) as T;
        } catch {
            return null;
        }
    }).filter((entry): entry is T => entry !== null);
}

