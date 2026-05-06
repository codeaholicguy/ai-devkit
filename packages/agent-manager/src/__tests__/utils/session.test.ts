/**
 * Tests for utils/session.ts
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import { batchGetSessionFileBirthtimes } from '../../utils/session';

jest.mock('fs', () => ({
    readdirSync: jest.fn(),
    statSync: jest.fn(),
}));

const mockedReaddirSync = fs.readdirSync as jest.MockedFunction<typeof fs.readdirSync>;
const mockedStatSync = fs.statSync as jest.MockedFunction<typeof fs.statSync>;

describe('batchGetSessionFileBirthtimes', () => {
    beforeEach(() => {
        mockedReaddirSync.mockReset();
        mockedStatSync.mockReset();
    });

    it('should parse session files correctly', () => {
        mockedReaddirSync.mockReturnValue([
            'abc123.jsonl',
            'def456.jsonl',
        ] as unknown as ReturnType<typeof fs.readdirSync>);
        mockedStatSync
            .mockReturnValueOnce({ birthtimeMs: 1710800324000 } as fs.Stats)
            .mockReturnValueOnce({ birthtimeMs: 1710800500000 } as fs.Stats);

        const results = batchGetSessionFileBirthtimes(['/home/.claude/projects/my-app']);

        expect(results).toHaveLength(2);
        expect(results[0]).toEqual({
            sessionId: 'abc123',
            filePath: '/home/.claude/projects/my-app/abc123.jsonl',
            projectDir: '/home/.claude/projects/my-app',
            birthtimeMs: 1710800324000,
            resolvedCwd: '',
        });
        expect(results[1].sessionId).toBe('def456');
        expect(results[1].birthtimeMs).toBe(1710800500000);
    });

    it('should return empty array for empty dirs list', () => {
        expect(batchGetSessionFileBirthtimes([])).toEqual([]);
        expect(mockedReaddirSync).not.toHaveBeenCalled();
    });

    it('should return empty array on readdir failure', () => {
        mockedReaddirSync.mockImplementation(() => {
            throw new Error('ENOENT');
        });

        expect(batchGetSessionFileBirthtimes(['/some/dir'])).toEqual([]);
    });

    it('should skip files with invalid birthtime (0 or negative)', () => {
        mockedReaddirSync.mockReturnValue([
            'bad.jsonl',
            'negative.jsonl',
            'good.jsonl',
        ] as unknown as ReturnType<typeof fs.readdirSync>);
        mockedStatSync
            .mockReturnValueOnce({ birthtimeMs: 0 } as fs.Stats)
            .mockReturnValueOnce({ birthtimeMs: -1 } as fs.Stats)
            .mockReturnValueOnce({ birthtimeMs: 1710800324000 } as fs.Stats);

        const results = batchGetSessionFileBirthtimes(['/dir']);
        expect(results).toHaveLength(1);
        expect(results[0].sessionId).toBe('good');
    });

    it('should skip non-jsonl files', () => {
        mockedReaddirSync.mockReturnValue([
            'sessions-index.json',
            'abc123.jsonl',
        ] as unknown as ReturnType<typeof fs.readdirSync>);
        mockedStatSync
            .mockReturnValueOnce({ birthtimeMs: 1710800500000 } as fs.Stats);

        const results = batchGetSessionFileBirthtimes(['/dir']);
        expect(results).toHaveLength(1);
        expect(results[0].sessionId).toBe('abc123');
    });

    it('should handle empty directory', () => {
        mockedReaddirSync.mockReturnValue([] as unknown as ReturnType<typeof fs.readdirSync>);
        expect(batchGetSessionFileBirthtimes(['/dir'])).toEqual([]);
    });

    it('should handle UUID session IDs', () => {
        mockedReaddirSync.mockReturnValue([
            '068e7b1f-cff5-4c94-bf69-b9acd32d765c.jsonl',
        ] as unknown as ReturnType<typeof fs.readdirSync>);
        mockedStatSync
            .mockReturnValueOnce({ birthtimeMs: 1710800324000 } as fs.Stats);

        const results = batchGetSessionFileBirthtimes(['/dir']);
        expect(results).toHaveLength(1);
        expect(results[0].sessionId).toBe('068e7b1f-cff5-4c94-bf69-b9acd32d765c');
    });

    it('should leave resolvedCwd empty', () => {
        mockedReaddirSync.mockReturnValue([
            'abc.jsonl',
        ] as unknown as ReturnType<typeof fs.readdirSync>);
        mockedStatSync
            .mockReturnValueOnce({ birthtimeMs: 1710800324000 } as fs.Stats);

        const results = batchGetSessionFileBirthtimes(['/dir']);
        expect(results[0].resolvedCwd).toBe('');
    });

    it('should enumerate multiple directories', () => {
        mockedReaddirSync
            .mockReturnValueOnce([
                'sess1.jsonl',
                'sess3.jsonl',
            ] as unknown as ReturnType<typeof fs.readdirSync>)
            .mockReturnValueOnce([
                'sess2.jsonl',
            ] as unknown as ReturnType<typeof fs.readdirSync>);
        mockedStatSync
            .mockReturnValueOnce({ birthtimeMs: 1710800324000 } as fs.Stats)
            .mockReturnValueOnce({ birthtimeMs: 1710800500000 } as fs.Stats)
            .mockReturnValueOnce({ birthtimeMs: 1710800400000 } as fs.Stats);

        const results = batchGetSessionFileBirthtimes(['/projects/app-a', '/projects/app-b']);

        expect(mockedReaddirSync).toHaveBeenCalledTimes(2);

        expect(results).toHaveLength(3);
        expect(results[0].projectDir).toBe('/projects/app-a');
        expect(results[1].projectDir).toBe('/projects/app-a');
        expect(results[2].projectDir).toBe('/projects/app-b');
    });

    it('should skip files where statSync fails', () => {
        mockedReaddirSync.mockReturnValue([
            'good.jsonl',
            'gone.jsonl',
        ] as unknown as ReturnType<typeof fs.readdirSync>);
        mockedStatSync
            .mockReturnValueOnce({ birthtimeMs: 1710800324000 } as fs.Stats)
            .mockImplementationOnce(() => { throw new Error('ENOENT'); });

        const results = batchGetSessionFileBirthtimes(['/dir']);
        expect(results).toHaveLength(1);
        expect(results[0].sessionId).toBe('good');
    });
});
