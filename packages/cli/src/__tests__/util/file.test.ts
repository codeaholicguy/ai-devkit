/**
 * Tests for file utilities
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    readLastLines,
    readJsonLines,
    readLastJsonLines,
    fileExists,
    readJson,
} from '../../util/file';

describe('file utilities', () => {
    let testDir: string;
    let testFile: string;
    let testJsonFile: string;
    let testJsonlFile: string;

    beforeAll(() => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-util-test-'));
        testFile = path.join(testDir, 'test.txt');
        testJsonFile = path.join(testDir, 'test.json');
        testJsonlFile = path.join(testDir, 'test.jsonl');
    });

    afterAll(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
    });

    describe('readLastLines', () => {
        it('should read last N lines from a file', () => {
            const content = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`).join('\n');
            fs.writeFileSync(testFile, content);

            const last10 = readLastLines(testFile, 10);

            expect(last10).toHaveLength(10);
            expect(last10[0]).toBe('Line 91');
            expect(last10[9]).toBe('Line 100');
        });

        it('should return all lines if file has fewer than requested', () => {
            fs.writeFileSync(testFile, 'Line 1\nLine 2\nLine 3');

            const lines = readLastLines(testFile, 100);

            expect(lines).toHaveLength(3);
            expect(lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
        });

        it('should return empty array for non-existent file', () => {
            const lines = readLastLines('/non/existent/file.txt', 10);
            expect(lines).toEqual([]);
        });

        it('should handle empty file', () => {
            fs.writeFileSync(testFile, '');
            const lines = readLastLines(testFile, 10);
            expect(lines).toEqual(['']);
        });
    });

    describe('readJsonLines', () => {
        it('should parse JSONL file', () => {
            const data = [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' },
                { id: 3, name: 'Charlie' },
            ];
            const content = data.map(obj => JSON.stringify(obj)).join('\n');
            fs.writeFileSync(testJsonlFile, content);

            const result = readJsonLines<{ id: number; name: string }>(testJsonlFile);

            expect(result).toHaveLength(3);
            expect(result[0]).toEqual({ id: 1, name: 'Alice' });
            expect(result[2]).toEqual({ id: 3, name: 'Charlie' });
        });

        it('should limit to maxLines', () => {
            const data = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
            const content = data.map(obj => JSON.stringify(obj)).join('\n');
            fs.writeFileSync(testJsonlFile, content);

            const result = readJsonLines(testJsonlFile, 10);

            expect(result).toHaveLength(10);
            expect(result[0].id).toBe(91);
            expect(result[9].id).toBe(100);
        });

        it('should skip malformed JSON lines', () => {
            const content = '{"valid": 1}\n{invalid json}\n{"valid": 2}';
            fs.writeFileSync(testJsonlFile, content);

            const result = readJsonLines(testJsonlFile);

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({ valid: 1 });
            expect(result[1]).toEqual({ valid: 2 });
        });

        it('should return empty array for non-existent file', () => {
            const result = readJsonLines('/non/existent/file.jsonl');
            expect(result).toEqual([]);
        });
    });

    describe('readLastJsonLines', () => {
        it('should read last N lines and parse as JSON', () => {
            const data = Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }));
            const content = data.map(obj => JSON.stringify(obj)).join('\n');
            fs.writeFileSync(testJsonlFile, content);

            const result = readLastJsonLines(testJsonlFile, 5);

            expect(result).toHaveLength(5);
            expect(result[0].id).toBe(46);
            expect(result[4].id).toBe(50);
        });
    });

    describe('fileExists', () => {
        it('should return true for existing file', () => {
            fs.writeFileSync(testFile, 'test');
            expect(fileExists(testFile)).toBe(true);
        });

        it('should return false for non-existent file', () => {
            expect(fileExists('/non/existent/file.txt')).toBe(false);
        });

        it('should return true for existing directory', () => {
            expect(fileExists(testDir)).toBe(true);
        });
    });

    describe('readJson', () => {
        it('should read and parse JSON file', () => {
            const data = { name: 'test', value: 123 };
            fs.writeFileSync(testJsonFile, JSON.stringify(data));

            const result = readJson<{ name: string; value: number }>(testJsonFile);

            expect(result).toEqual(data);
        });

        it('should return null for non-existent file', () => {
            const result = readJson('/non/existent/file.json');
            expect(result).toBeNull();
        });

        it('should return null for invalid JSON', () => {
            fs.writeFileSync(testJsonFile, '{invalid json}');
            const result = readJson(testJsonFile);
            expect(result).toBeNull();
        });

        it('should handle nested objects', () => {
            const data = {
                user: {
                    name: 'Alice',
                    age: 30,
                    settings: {
                        theme: 'dark',
                    },
                },
            };
            fs.writeFileSync(testJsonFile, JSON.stringify(data));

            const result = readJson(testJsonFile);

            expect(result).toEqual(data);
            expect(result?.user.settings.theme).toBe('dark');
        });
    });
});
