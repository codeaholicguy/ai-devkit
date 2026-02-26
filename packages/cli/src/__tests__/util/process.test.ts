/**
 * Tests for process detection utilities
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { execSync } from 'child_process';
import {
    listProcesses,
    getProcessCwd,
    getProcessTty,
    isProcessRunning,
    getProcessInfo,
} from '../../util/process';

jest.mock('child_process', () => ({
    execSync: jest.fn(),
}));

const mockExecSync = execSync as unknown as jest.Mock;

function defaultExec(command: string): string {
    if (command === 'ps aux') {
        return [
            'USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND',
            'dev 101 0.0 0.1 1000 100 ttys001 S 10:00 0:00 node server.js',
            'dev 202 0.0 0.1 1000 100 ttys002 S 10:01 0:00 claude --debug',
        ].join('\n');
    }

    const lsofMatch = command.match(/^lsof -a -p (\d+) -d cwd -Fn 2>\/dev\/null$/);
    if (lsofMatch) {
        const pid = lsofMatch[1];
        return `p${pid}\nn/tmp/project-${pid}\n`;
    }

    const pwdxMatch = command.match(/^pwdx (\d+) 2>\/dev\/null$/);
    if (pwdxMatch) {
        return `${pwdxMatch[1]}: /tmp/pwdx-${pwdxMatch[1]}\n`;
    }

    const ttyMatch = command.match(/^ps -p (\d+) -o tty=$/);
    if (ttyMatch) {
        return '/dev/ttys009\n';
    }

    const killMatch = command.match(/^kill -0 (\d+) 2>\/dev\/null$/);
    if (killMatch) {
        if (killMatch[1] === '999999') {
            throw new Error('No such process');
        }
        return '';
    }

    throw new Error(`Unexpected command: ${command}`);
}

function setupDefaultExecMocks(): void {
    mockExecSync.mockImplementation((cmd: unknown) => {
        const command = String(cmd);
        return defaultExec(command);
    });
}

describe('process utilities', () => {
    beforeEach(() => {
        mockExecSync.mockReset();
        setupDefaultExecMocks();
    });

    describe('listProcesses', () => {
        it('should return parsed process list', () => {
            const processes = listProcesses();

            expect(processes).toHaveLength(2);
            expect(processes[0]).toEqual({
                pid: 101,
                command: 'node server.js',
                cwd: '/tmp/project-101',
                tty: 'ttys001',
            });
        });

        it('should filter by name pattern case-insensitively', () => {
            const upper = listProcesses({ namePattern: 'NODE' });
            const lower = listProcesses({ namePattern: 'node' });

            expect(upper).toHaveLength(1);
            expect(lower).toHaveLength(1);
            expect(upper[0].command.toLowerCase()).toContain('node');
        });

        it('should filter by pid', () => {
            const processes = listProcesses({ pids: [202] });
            expect(processes).toHaveLength(1);
            expect(processes[0].pid).toBe(202);
        });

        it('should return empty array when ps fails', () => {
            mockExecSync.mockImplementationOnce(() => {
                throw new Error('ps failed');
            });

            expect(listProcesses()).toEqual([]);
        });
    });

    describe('getProcessCwd', () => {
        it('should return cwd from lsof', () => {
            expect(getProcessCwd(101)).toBe('/tmp/project-101');
        });

        it('should return empty string when both lsof and pwdx fail', () => {
            mockExecSync.mockImplementation((cmd: unknown) => {
                const command = String(cmd);
                if (command.startsWith('lsof -a -p 404') || command.startsWith('pwdx 404')) {
                    throw new Error('failed');
                }
                throw new Error(`Unexpected command: ${command}`);
            });

            expect(getProcessCwd(404)).toBe('');
        });
    });

    describe('getProcessTty', () => {
        it('should return tty without /dev prefix', () => {
            expect(getProcessTty(101)).toBe('ttys009');
        });

        it('should return ? when lookup fails', () => {
            mockExecSync.mockImplementation((cmd: unknown) => {
                const command = String(cmd);
                if (command === 'ps -p 505 -o tty=') {
                    throw new Error('ps failed');
                }
                return defaultExec(command);
            });

            expect(getProcessTty(505)).toBe('?');
        });
    });

    describe('isProcessRunning', () => {
        it('should return true when kill -0 succeeds', () => {
            expect(isProcessRunning(101)).toBe(true);
        });

        it('should return false when kill -0 fails', () => {
            expect(isProcessRunning(999999)).toBe(false);
        });
    });

    describe('getProcessInfo', () => {
        it('should return process details when found', () => {
            const info = getProcessInfo(101);

            expect(info).not.toBeNull();
            expect(info?.pid).toBe(101);
            expect(info?.command).toContain('node');
        });

        it('should return null when process does not exist', () => {
            expect(getProcessInfo(999999)).toBeNull();
        });
    });
});
