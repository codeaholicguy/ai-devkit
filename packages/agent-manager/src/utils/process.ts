/**
 * Process Detection Utilities
 *
 * Shared shell command wrappers for detecting and inspecting running processes.
 * All execFileSync calls for process data live here — adapters must not call execFileSync directly.
 */

import * as path from 'path';
import { execFileSync } from 'child_process';
import type { ProcessInfo } from '../adapters/AgentAdapter';

/**
 * List running processes matching an agent executable name.
 *
 * Uses `ps aux` then filters in JS for exact executable basename match.
 * This avoids shell pipelines and string interpolation.
 *
 * Returned ProcessInfo has pid, command, tty populated.
 * cwd and startTime are NOT populated — call enrichProcesses() to fill them.
 */
export function listAgentProcesses(namePattern: string): ProcessInfo[] {
    // Validate pattern contains only safe characters (alphanumeric, dash, underscore)
    if (!namePattern || !/^[a-zA-Z0-9_-]+$/.test(namePattern)) {
        return [];
    }

    try {
        const output = execFileSync('ps', ['aux'], { encoding: 'utf-8' });

        const lowerPattern = namePattern.toLowerCase();
        const processes: ProcessInfo[] = [];

        for (const line of output.trim().split('\n')) {
            if (!line.trim()) continue;

            const parts = line.trim().split(/\s+/);
            if (parts.length < 11) continue;

            const pid = parseInt(parts[1], 10);
            if (Number.isNaN(pid)) continue;

            const tty = parts[6];
            const command = parts.slice(10).join(' ');

            // Check that the executable basename matches exactly
            const executable = command.trim().split(/\s+/)[0] || '';
            const base = path.basename(executable).toLowerCase();
            if (base !== lowerPattern && base !== `${lowerPattern}.exe`) {
                continue;
            }

            const ttyShort = tty.startsWith('/dev/') ? tty.slice(5) : tty;

            processes.push({
                pid,
                command,
                cwd: '',
                tty: ttyShort,
            });
        }

        return processes;
    } catch {
        return [];
    }
}

/**
 * Batch-get current working directories for multiple PIDs.
 *
 * Single `lsof -a -d cwd -Fn -p PID1,PID2,...` call.
 * Returns partial results — if lsof fails for one PID, others still return.
 */
export function batchGetProcessCwds(pids: number[]): Map<number, string> {
    const result = new Map<number, string>();
    if (pids.length === 0) return result;

    try {
        const output = execFileSync(
            'lsof', ['-a', '-d', 'cwd', '-Fn', '-p', pids.join(',')],
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] },
        );

        // lsof output format: p{PID}\nn{path}\np{PID}\nn{path}...
        let currentPid: number | null = null;
        for (const line of output.trim().split('\n')) {
            if (line.startsWith('p')) {
                currentPid = parseInt(line.slice(1), 10);
            } else if (line.startsWith('n') && currentPid !== null) {
                result.set(currentPid, line.slice(1));
                currentPid = null;
            }
        }
    } catch {
        // Try per-PID fallback with pwdx (Linux)
        for (const pid of pids) {
            try {
                const output = execFileSync(
                    'pwdx', [String(pid)],
                    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] },
                );
                const match = output.match(/^\d+:\s*(.+)$/);
                if (match) {
                    result.set(pid, match[1].trim());
                }
            } catch {
                // Skip this PID
            }
        }
    }

    return result;
}

/**
 * Batch-get process start times for multiple PIDs.
 *
 * Single `ps -o pid=,lstart= -p PID1,PID2,...` call.
 * Uses lstart format which gives full timestamp (e.g., "Thu Feb  5 16:00:57 2026").
 * Returns partial results.
 */
export function batchGetProcessStartTimes(pids: number[]): Map<number, Date> {
    const result = new Map<number, Date>();
    if (pids.length === 0) return result;

    try {
        const output = execFileSync(
            'ps', ['-o', 'pid=,lstart=', '-p', pids.join(',')],
            { encoding: 'utf-8' },
        );

        for (const rawLine of output.split('\n')) {
            const line = rawLine.trim();
            if (!line) continue;

            // Format: "  PID  DAY MON DD HH:MM:SS YYYY"
            // e.g., " 78070 Wed Mar 18 23:18:01 2026"
            const match = line.match(/^\s*(\d+)\s+(.+)$/);
            if (!match) continue;

            const pid = parseInt(match[1], 10);
            const dateStr = match[2].trim();

            if (!Number.isFinite(pid)) continue;

            const date = new Date(dateStr);
            if (!Number.isNaN(date.getTime())) {
                result.set(pid, date);
            }
        }
    } catch {
        // Return whatever we have
    }

    return result;
}

/**
 * Enrich ProcessInfo array with cwd and startTime.
 *
 * Calls batchGetProcessCwds and batchGetProcessStartTimes in batched shell calls,
 * then populates each ProcessInfo in-place. Returns partial results —
 * if a PID fails, that process keeps empty cwd / undefined startTime.
 */
export function enrichProcesses(processes: ProcessInfo[]): ProcessInfo[] {
    if (processes.length === 0) return processes;

    const pids = processes.map(p => p.pid);
    const cwdMap = batchGetProcessCwds(pids);
    const startTimeMap = batchGetProcessStartTimes(pids);

    for (const proc of processes) {
        proc.cwd = cwdMap.get(proc.pid) || '';
        proc.startTime = startTimeMap.get(proc.pid);
    }

    return processes;
}

/**
 * Get the TTY device for a specific process
 */
export function getProcessTty(pid: number): string {
    try {
        const output = execFileSync(
            'ps', ['-p', String(pid), '-o', 'tty='],
            { encoding: 'utf-8' },
        );

        const tty = output.trim();
        return tty.startsWith('/dev/') ? tty.slice(5) : tty;
    } catch {
        return '?';
    }
}
