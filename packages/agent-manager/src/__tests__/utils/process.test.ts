/**
 * Tests for new functions in utils/process.ts
 */

import type { MockedFunction } from 'vitest';

import { execFileSync } from 'child_process';
import {
    listAgentProcesses,
    batchGetProcessCwds,
    batchGetProcessStartTimes,
    enrichProcesses,
} from '../../utils/process.js';

vi.mock('child_process', () => ({
    execFileSync: vi.fn(),
}));

const mockedExecFileSync = execFileSync as MockedFunction<typeof execFileSync>;

describe('listAgentProcesses', () => {
    beforeEach(() => {
        mockedExecFileSync.mockReset();
    });

    it('should parse ps output and post-filter by executable name', () => {
        mockedExecFileSync.mockReturnValue(
            '78070     1 s018     claude\n' +
            '55106 55100 s015     claude\n',
        );

        const processes = listAgentProcesses('claude');
        expect(processes).toHaveLength(2);
        expect(processes[0].pid).toBe(78070);
        expect(processes[0].ppid).toBe(1);
        expect(processes[0].command).toBe('claude');
        expect(processes[0].tty).toBe('s018');
        expect(processes[0].cwd).toBe(''); // not populated yet
        expect(processes[1].pid).toBe(55106);
        expect(processes[1].ppid).toBe(55100);
    });

    it('should filter out non-matching executables', () => {
        mockedExecFileSync.mockReturnValue(
            '100 1 s001 claude\n' +
            '200 1 s002 claude-helper --pid 100\n' +
            '300 1 s003 /usr/bin/claude\n',
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
        expect(mockedExecFileSync).toHaveBeenCalledWith(
            'ps',
            ['-axo', 'pid=,ppid=,tty=,command='],
            { encoding: 'utf-8' },
        );

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
