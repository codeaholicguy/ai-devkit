/**
 * Tests for utils/session.ts
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { execSync } from 'child_process';
import { batchGetSessionFileBirthtimes } from '../../utils/session';

jest.mock('child_process', () => ({
    execSync: jest.fn(),
}));

const mockedExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('batchGetSessionFileBirthtimes', () => {
    beforeEach(() => {
        mockedExecSync.mockReset();
    });

    it('should parse stat output correctly', () => {
        mockedExecSync.mockReturnValue(
            '1710800324 /home/.claude/projects/my-app/abc123.jsonl\n' +
            '1710800500 /home/.claude/projects/my-app/def456.jsonl\n',
        );

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
        expect(mockedExecSync).not.toHaveBeenCalled();
    });

    it('should return empty array on command failure', () => {
        mockedExecSync.mockImplementation(() => {
            throw new Error('Command failed');
        });

        expect(batchGetSessionFileBirthtimes(['/some/dir'])).toEqual([]);
    });

    it('should skip lines with invalid epoch (0 or negative)', () => {
        mockedExecSync.mockReturnValue(
            '0 /dir/bad.jsonl\n' +
            '-1 /dir/negative.jsonl\n' +
            '1710800324 /dir/good.jsonl\n',
        );

        const results = batchGetSessionFileBirthtimes(['/dir']);
        expect(results).toHaveLength(1);
        expect(results[0].sessionId).toBe('good');
    });

    it('should skip non-jsonl files in output', () => {
        mockedExecSync.mockReturnValue(
            '1710800324 /dir/sessions-index.json\n' +
            '1710800500 /dir/abc123.jsonl\n',
        );

        const results = batchGetSessionFileBirthtimes(['/dir']);
        expect(results).toHaveLength(1);
        expect(results[0].sessionId).toBe('abc123');
    });

    it('should handle empty output', () => {
        mockedExecSync.mockReturnValue('');
        expect(batchGetSessionFileBirthtimes(['/dir'])).toEqual([]);
    });

    it('should handle UUID session IDs', () => {
        mockedExecSync.mockReturnValue(
            '1710800324 /dir/068e7b1f-cff5-4c94-bf69-b9acd32d765c.jsonl\n',
        );

        const results = batchGetSessionFileBirthtimes(['/dir']);
        expect(results).toHaveLength(1);
        expect(results[0].sessionId).toBe('068e7b1f-cff5-4c94-bf69-b9acd32d765c');
    });

    it('should leave resolvedCwd empty', () => {
        mockedExecSync.mockReturnValue('1710800324 /dir/abc.jsonl\n');

        const results = batchGetSessionFileBirthtimes(['/dir']);
        expect(results[0].resolvedCwd).toBe('');
    });

    it('should combine multiple directories into a single stat call', () => {
        mockedExecSync.mockReturnValue(
            '1710800324 /projects/app-a/sess1.jsonl\n' +
            '1710800400 /projects/app-b/sess2.jsonl\n' +
            '1710800500 /projects/app-a/sess3.jsonl\n',
        );

        const results = batchGetSessionFileBirthtimes(['/projects/app-a', '/projects/app-b']);

        expect(mockedExecSync).toHaveBeenCalledTimes(1);
        const cmd = mockedExecSync.mock.calls[0][0] as string;
        expect(cmd).toContain('"/projects/app-a"/*.jsonl');
        expect(cmd).toContain('"/projects/app-b"/*.jsonl');

        expect(results).toHaveLength(3);
        expect(results[0].projectDir).toBe('/projects/app-a');
        expect(results[1].projectDir).toBe('/projects/app-b');
        expect(results[2].projectDir).toBe('/projects/app-a');
    });
});
