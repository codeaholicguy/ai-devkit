/**
 * Tests for process detection utilities
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import {
    listProcesses,
    getProcessCwd,
    getProcessTty,
    isProcessRunning,
    getProcessInfo,
} from '../../util/process';

describe('process utilities', () => {
    let currentPid: number;

    beforeAll(() => {
        currentPid = process.pid;
    });

    describe('listProcesses', () => {
        it('should return an array of processes', () => {
            const processes = listProcesses();
            expect(Array.isArray(processes)).toBe(true);
            expect(processes.length).toBeGreaterThan(0);
        });

        it('should include process info fields', () => {
            const processes = listProcesses();
            const firstProcess = processes[0];

            expect(firstProcess).toHaveProperty('pid');
            expect(firstProcess).toHaveProperty('command');
            expect(firstProcess).toHaveProperty('cwd');
            expect(firstProcess).toHaveProperty('tty');

            expect(typeof firstProcess.pid).toBe('number');
            expect(typeof firstProcess.command).toBe('string');
            expect(typeof firstProcess.cwd).toBe('string');
            expect(typeof firstProcess.tty).toBe('string');
        });

        it('should filter by name pattern', () => {
            // Filter for node processes (this test itself runs in node)
            const nodeProcesses = listProcesses({ namePattern: 'node' });

            expect(nodeProcesses.length).toBeGreaterThan(0);

            // All results should contain 'node' in command (case-insensitive)
            nodeProcesses.forEach(proc => {
                expect(proc.command.toLowerCase()).toContain('node');
            });
        });

        it('should filter by PID', () => {
            const processes = listProcesses({ pids: [currentPid] });

            expect(processes.length).toBeGreaterThan(0);
            expect(processes[0].pid).toBe(currentPid);
        });

        it('should return empty array for non-existent PID', () => {
            // Use a very high PID that's unlikely to exist
            const processes = listProcesses({ pids: [999999] });
            expect(processes.length).toBe(0);
        });

        it('should handle case-insensitive name matching', () => {
            const upperCase = listProcesses({ namePattern: 'NODE' });
            const lowerCase = listProcesses({ namePattern: 'node' });

            // Should return same results regardless of case
            expect(upperCase.length).toBe(lowerCase.length);
        });
    });

    describe('getProcessCwd', () => {
        it('should return current working directory for current process', () => {
            const cwd = getProcessCwd(currentPid);

            expect(cwd).toBeTruthy();
            expect(cwd.length).toBeGreaterThan(0);
            // Should be an absolute path
            expect(cwd).toMatch(/^\//);
        });

        it('should return empty string for non-existent process', () => {
            const cwd = getProcessCwd(999999);
            expect(cwd).toBe('');
        });
    });

    describe('getProcessTty', () => {
        it('should return TTY for current process', () => {
            const tty = getProcessTty(currentPid);

            expect(typeof tty).toBe('string');
            // TTY should not start with /dev/ (we strip it)
            expect(tty).not.toMatch(/^\/dev\//);
        });

        it('should return "?" for non-existent process', () => {
            const tty = getProcessTty(999999);
            expect(tty).toBe('?');
        });
    });

    describe('isProcessRunning', () => {
        it('should return true for current process', () => {
            const running = isProcessRunning(currentPid);
            expect(running).toBe(true);
        });

        it('should return false for non-existent process', () => {
            const running = isProcessRunning(999999);
            expect(running).toBe(false);
        });
    });

    describe('getProcessInfo', () => {
        it('should return process info for existing process', () => {
            const info = getProcessInfo(currentPid);

            expect(info).not.toBeNull();
            expect(info?.pid).toBe(currentPid);
            expect(info?.command).toContain('node');
            expect(info?.cwd).toBeTruthy();
        });

        it('should return null for non-existent process', () => {
            const info = getProcessInfo(999999);
            expect(info).toBeNull();
        });
    });

    describe('integration test', () => {
        it('should find node process with all details', () => {
            const processes = listProcesses({ namePattern: 'node' });

            // Should find at least the test runner process
            expect(processes.length).toBeGreaterThan(0);

            const currentProcess = processes.find(p => p.pid === currentPid);
            expect(currentProcess).toBeDefined();

            if (currentProcess) {
                expect(currentProcess.command).toContain('node');
                expect(currentProcess.cwd.length).toBeGreaterThan(0);
                expect(currentProcess.tty).toBeDefined();
            }
        });
    });
});
