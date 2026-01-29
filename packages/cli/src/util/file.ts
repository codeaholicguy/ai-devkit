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
    if (!fs.existsSync(filePath)) {
        return [];
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const allLines = content.trim().split('\n');

        // Return last N lines (or all if file has fewer lines)
        return allLines.slice(-lineCount);
    } catch (error) {
        console.error(`Failed to read ${filePath}:`, error);
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
export function readJsonLines<T = any>(filePath: string, maxLines: number = 1000): T[] {
    const lines = readLastLines(filePath, maxLines);

    return lines.map(line => {
        try {
            return JSON.parse(line) as T;
        } catch {
            return null;
        }
    }).filter((entry): entry is T => entry !== null);
}

/**
 * Check if a file exists
 * 
 * @param filePath Path to check
 * @returns True if file exists
 */
export function fileExists(filePath: string): boolean {
    try {
        return fs.existsSync(filePath);
    } catch {
        return false;
    }
}

/**
 * Read a JSON file safely
 * 
 * @param filePath Path to JSON file
 * @returns Parsed JSON object or null if error
 * 
 * @example
 * ```typescript
 * const config = readJson<ConfigType>('/path/to/config.json');
 * ```
 */
export function readJson<T = any>(filePath: string): T | null {
    if (!fs.existsSync(filePath)) {
        return null;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content) as T;
    } catch (error) {
        console.error(`Failed to parse JSON from ${filePath}:`, error);
        return null;
    }
}