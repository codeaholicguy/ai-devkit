/**
 * Tests for new functions in utils/process.ts
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { execFileSync } from 'child_process';
import {
    listAgentProcesses,
    batchGetProcessCwds,
    batchGetProcessStartTimes,
    enrichProcesses,
} from '../../utils/process';

jest.mock('child_process', () => ({
    execFileSync: jest.fn(),
}));

const mockedExecFileSync = execFileSync as jest.MockedFunction<typeof execFileSync>;

describe('listAgentProcesses', () => {
    beforeEach(() => {
        mockedExecFileSync.mockReset();
    });

    it('should parse ps aux | grep output and post-filter by executable name', () => {
        mockedExecFileSync.mockReturnValue(
            'user  78070  1.0  0.5 485636016 245952 s018  S+   11:18PM   1:55.14 claude\n' +
            'user  55106  0.1  0.4 485620368  72496 s015  S+    9Mar26   8:06.36 claude\n',
        );

        const processes = listAgentProcesses('claude');
        expect(processes).toHaveLength(2);
        expect(processes[0].pid).toBe(78070);
        expect(processes[0].command).toBe('claude');
        expect(processes[0].tty).toBe('s018');
        expect(processes[0].cwd).toBe(''); // not populated yet
        expect(processes[1].pid).toBe(55106);
    });

    it('should filter out non-matching executables', () => {
        mockedExecFileSync.mockReturnValue(
            'user  100  0.0  0.0 0 0 s001  S  1:00PM  0:00 claude\n' +
            'user  200  0.0  0.0 0 0 s002  S  1:00PM  0:00 claude-helper --pid 100\n' +
            'user  300  0.0  0.0 0 0 s003  S  1:00PM  0:00 /usr/bin/claude\n',
        );

        const processes = listAgentProcesses('claude');
        expect(processes).toHaveLength(2);
        expect(processes.map(p => p.pid)).toEqual([100, 300]);
    });

    it('should return empty array on command failure', () => {
        mockedExecFileSync.mockImplementation(() => { throw new Error('fail'); });
        expect(listAgentProcesses('claude')).toEqual([]);
    });

    it('should handle empty output', () => {
        mockedExecFileSync.mockReturnValue('');
        expect(listAgentProcesses('claude')).toEqual([]);
    });

    it('should reject empty pattern', () => {
        expect(listAgentProcesses('')).toEqual([]);
        expect(mockedExecFileSync).not.toHaveBeenCalled();
    });

    it('should reject patterns with shell injection characters', () => {
        expect(listAgentProcesses('claude; rm -rf /')).toEqual([]);
        expect(listAgentProcesses("claude' || true")).toEqual([]);
        expect(listAgentProcesses('$(whoami)')).toEqual([]);
        expect(mockedExecFileSync).not.toHaveBeenCalled();
    });

    it('should accept valid patterns with dashes and underscores', () => {
        mockedExecFileSync.mockReturnValue('');
        listAgentProcesses('claude-code');
        expect(mockedExecFileSync).toHaveBeenCalled();

        mockedExecFileSync.mockReset();
        mockedExecFileSync.mockReturnValue('');
        listAgentProcesses('my_agent');
        expect(mockedExecFileSync).toHaveBeenCalled();
    });
});

describe('batchGetProcessCwds', () => {
    beforeEach(() => {
        mockedExecFileSync.mockReset();
    });

    it('should parse batched lsof output', () => {
        mockedExecFileSync.mockReturnValue(
            'p78070\nn/Users/user/ai-devkit\np55106\nn/Users/user/other-project\n',
        );

        const cwds = batchGetProcessCwds([78070, 55106]);
        expect(cwds.get(78070)).toBe('/Users/user/ai-devkit');
        expect(cwds.get(55106)).toBe('/Users/user/other-project');
    });

    it('should return empty map for empty pids', () => {
        expect(batchGetProcessCwds([])).toEqual(new Map());
    });

    it('should return partial results when lsof succeeds for some PIDs', () => {
        // lsof might not return entries for dead processes
        mockedExecFileSync.mockReturnValue(
            'p78070\nn/Users/user/ai-devkit\n',
        );

        const cwds = batchGetProcessCwds([78070, 99999]);
        expect(cwds.size).toBe(1);
        expect(cwds.get(78070)).toBe('/Users/user/ai-devkit');
    });

    it('should return empty map on total failure', () => {
        mockedExecFileSync.mockImplementation(() => { throw new Error('fail'); });
        const cwds = batchGetProcessCwds([78070]);
        // Falls through to pwdx fallback which also fails
        expect(cwds.size).toBe(0);
    });
});

describe('batchGetProcessStartTimes', () => {
    beforeEach(() => {
        mockedExecFileSync.mockReset();
    });

    it('should parse ps lstart output', () => {
        mockedExecFileSync.mockReturnValue(
            ' 78070 Wed Mar 18 23:18:01 2026\n' +
            ' 55106 Mon Mar  9 21:41:42 2026\n',
        );

        const times = batchGetProcessStartTimes([78070, 55106]);
        expect(times.size).toBe(2);
        expect(times.get(78070)?.getFullYear()).toBe(2026);
        expect(times.get(55106)?.getMonth()).toBe(2); // March = 2
    });

    it('should return empty map for empty pids', () => {
        expect(batchGetProcessStartTimes([])).toEqual(new Map());
    });

    it('should skip lines with unparseable dates', () => {
        mockedExecFileSync.mockReturnValue(
            ' 78070 Wed Mar 18 23:18:01 2026\n' +
            ' 99999 INVALID_DATE\n',
        );

        const times = batchGetProcessStartTimes([78070, 99999]);
        expect(times.size).toBe(1);
        expect(times.has(78070)).toBe(true);
    });

    it('should return empty map on failure', () => {
        mockedExecFileSync.mockImplementation(() => { throw new Error('fail'); });
        expect(batchGetProcessStartTimes([78070])).toEqual(new Map());
    });
});

describe('enrichProcesses', () => {
    beforeEach(() => {
        mockedExecFileSync.mockReset();
    });

    it('should populate cwd and startTime on processes', () => {
        // First call: batchGetProcessCwds (lsof)
        // Second call: batchGetProcessStartTimes (ps lstart)
        mockedExecFileSync
            .mockReturnValueOnce('p100\nn/projects/app\n')
            .mockReturnValueOnce(' 100 Wed Mar 18 23:18:01 2026\n');

        const processes = [
            { pid: 100, command: 'claude', cwd: '', tty: 's001' },
        ];

        const enriched = enrichProcesses(processes);
        expect(enriched[0].cwd).toBe('/projects/app');
        expect(enriched[0].startTime).toBeDefined();
    });

    it('should return empty array for empty input', () => {
        expect(enrichProcesses([])).toEqual([]);
        expect(mockedExecFileSync).not.toHaveBeenCalled();
    });

    it('should handle partial failures', () => {
        // lsof succeeds, ps lstart fails
        mockedExecFileSync
            .mockReturnValueOnce('p100\nn/projects/app\n')
            .mockImplementationOnce(() => { throw new Error('fail'); });

        const processes = [
            { pid: 100, command: 'claude', cwd: '', tty: 's001' },
        ];

        const enriched = enrichProcesses(processes);
        expect(enriched[0].cwd).toBe('/projects/app');
        expect(enriched[0].startTime).toBeUndefined();
    });
});
