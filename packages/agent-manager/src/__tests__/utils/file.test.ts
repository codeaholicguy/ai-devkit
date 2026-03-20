/**
 * Tests for utils/file.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { readLastLines, readJsonLines } from '../../utils/file';

describe('readLastLines', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'file-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should read all lines from a small file', () => {
        const filePath = path.join(tmpDir, 'small.txt');
        fs.writeFileSync(filePath, 'line1\nline2\nline3');

        const lines = readLastLines(filePath);
        expect(lines).toEqual(['line1', 'line2', 'line3']);
    });

    it('should return last N lines when lineCount is specified', () => {
        const filePath = path.join(tmpDir, 'lines.txt');
        fs.writeFileSync(filePath, 'a\nb\nc\nd\ne');

        const lines = readLastLines(filePath, 2);
        expect(lines).toEqual(['d', 'e']);
    });

    it('should return empty array for non-existent file', () => {
        expect(readLastLines(path.join(tmpDir, 'missing.txt'))).toEqual([]);
    });

    it('should return empty array for empty file', () => {
        const filePath = path.join(tmpDir, 'empty.txt');
        fs.writeFileSync(filePath, '');

        const lines = readLastLines(filePath);
        expect(lines).toEqual(['']);
    });
});

describe('readJsonLines', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'file-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should parse JSONL file', () => {
        const filePath = path.join(tmpDir, 'data.jsonl');
        fs.writeFileSync(filePath, [
            JSON.stringify({ id: 1 }),
            JSON.stringify({ id: 2 }),
        ].join('\n'));

        const entries = readJsonLines<{ id: number }>(filePath);
        expect(entries).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should skip malformed JSON lines', () => {
        const filePath = path.join(tmpDir, 'mixed.jsonl');
        fs.writeFileSync(filePath, [
            JSON.stringify({ id: 1 }),
            'not json',
            JSON.stringify({ id: 3 }),
        ].join('\n'));

        const entries = readJsonLines<{ id: number }>(filePath);
        expect(entries).toEqual([{ id: 1 }, { id: 3 }]);
    });

    it('should return empty array for non-existent file', () => {
        expect(readJsonLines(path.join(tmpDir, 'missing.jsonl'))).toEqual([]);
    });

    it('should respect maxLines parameter', () => {
        const filePath = path.join(tmpDir, 'many.jsonl');
        const lines = Array.from({ length: 10 }, (_, i) => JSON.stringify({ id: i }));
        fs.writeFileSync(filePath, lines.join('\n'));

        const entries = readJsonLines<{ id: number }>(filePath, 3);
        expect(entries).toHaveLength(3);
        expect(entries[0].id).toBe(7);
        expect(entries[2].id).toBe(9);
    });
});
