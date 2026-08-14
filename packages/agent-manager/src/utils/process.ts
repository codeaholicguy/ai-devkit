/**
 * Process Detection Utilities
 *
 * Shared shell command wrappers for detecting and inspecting running processes.
 * Built-in refresh discovery uses captureProcessSnapshot(); synchronous helpers
 * remain exported for compatibility with existing consumers.
 */

import * as path from 'path';
import { execFile, execFileSync } from 'child_process';
import type { ProcessInfo } from '../adapters/AgentAdapter.js';

const PROCESS_EXEC_MAX_BUFFER = 10 * 1024 * 1024;
const VALID_EXECUTABLE_NAME = /^[a-zA-Z0-9_-]+$/;

export function executableBasename(command: string): string {
    const executable = command.trim().split(/\s+/)[0] || '';
    return path.basename(executable.replace(/\\/g, '/')).toLowerCase();
}

function normalizeExecutableName(name: string): string {
    const lower = name.toLowerCase();
    return lower.endsWith('.exe') ? lower.slice(0, -4) : lower;
}

function normalizedProcessNames(namePatterns: readonly string[]): Set<string> {
    return new Set(namePatterns.filter(Boolean).map(normalizeExecutableName));
}

export function filterByProcessNames(
    processes: readonly ProcessInfo[],
    namePatterns: readonly string[],
): ProcessInfo[] {
    const names = normalizedProcessNames(namePatterns);
    if (names.size === 0) return [];
    return processes.filter((process) => (
        names.has(normalizeExecutableName(executableBasename(process.command)))
    ));
}

/**
 * List running processes matching an agent executable name.
 *
 * Uses `ps -axo` then filters in JS for exact executable basename match.
 * This avoids shell pipelines and string interpolation.
 *
 * Returned ProcessInfo has pid, ppid, command, tty populated.
 * cwd and startTime are NOT populated — call enrichProcesses() to fill them.
 */
export function listAgentProcesses(namePattern: string): ProcessInfo[] {
    // Validate pattern contains only safe characters (alphanumeric, dash, underscore)
    if (!namePattern || !VALID_EXECUTABLE_NAME.test(namePattern)) {
        return [];
    }

    try {
        const output = execFileSync('ps', ['-axo', 'pid=,ppid=,tty=,command='], { encoding: 'utf-8' });

        const names = normalizedProcessNames([namePattern]);
        const processes: ProcessInfo[] = [];

        for (const line of output.trim().split('\n')) {
            if (!line.trim()) continue;

            const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
            if (!match) continue;

            const pid = parseInt(match[1], 10);
            const ppid = parseInt(match[2], 10);
            if (Number.isNaN(pid) || Number.isNaN(ppid)) continue;

            const tty = match[3];
            const command = match[4];

            if (!names.has(normalizeExecutableName(executableBasename(command)))) continue;

            const ttyShort = tty.startsWith('/dev/') ? tty.slice(5) : tty;

            processes.push({
                pid,
                ppid,
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

function execFileText(
    file: string,
    args: readonly string[],
): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(file, args, { encoding: 'utf-8', maxBuffer: PROCESS_EXEC_MAX_BUFFER }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
}

function parseProcessList(output: string, namePatterns: ReadonlySet<string>): ProcessInfo[] {
    const processes: ProcessInfo[] = [];

    for (const line of output.trim().split('\n')) {
        if (!line.trim()) continue;

        const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
        if (!match) continue;

        const pid = parseInt(match[1], 10);
        const ppid = parseInt(match[2], 10);
        if (Number.isNaN(pid) || Number.isNaN(ppid)) continue;

        const tty = match[3];
        const command = match[4];
        const base = executableBasename(command);
        const normalizedBase = normalizeExecutableName(base);
        if (!namePatterns.has(normalizedBase)) continue;

        processes.push({
            pid,
            ppid,
            command,
            cwd: '',
            tty: tty.startsWith('/dev/') ? tty.slice(5) : tty,
        });
    }

    return processes;
}

async function batchGetProcessCwdsAsync(pids: number[]): Promise<Map<number, string>> {
    const result = new Map<number, string>();
    if (pids.length === 0) return result;

    try {
        const output = await execFileText('lsof', ['-a', '-d', 'cwd', '-Fn', '-p', pids.join(',')]);
        let currentPid: number | null = null;
        for (const line of output.trim().split('\n')) {
            if (line.startsWith('p')) {
                currentPid = parseInt(line.slice(1), 10);
            } else if (line.startsWith('n') && currentPid !== null) {
                result.set(currentPid, line.slice(1));
                currentPid = null;
            }
        }
        return result;
    } catch {
        const entries = await Promise.all(pids.map(async (pid) => {
            try {
                const output = await execFileText('pwdx', [String(pid)]);
                const match = output.match(/^\d+:\s*(.+)$/);
                return match ? [pid, match[1].trim()] as const : null;
            } catch {
                return null;
            }
        }));
        for (const entry of entries) {
            if (entry) result.set(entry[0], entry[1]);
        }
        return result;
    }
}

async function batchGetProcessStartTimesAsync(pids: number[]): Promise<Map<number, Date>> {
    const result = new Map<number, Date>();
    if (pids.length === 0) return result;

    try {
        const output = await execFileText('ps', ['-o', 'pid=,lstart=', '-p', pids.join(',')]);
        for (const rawLine of output.split('\n')) {
            const match = rawLine.trim().match(/^(\d+)\s+(.+)$/);
            if (!match) continue;
            const pid = parseInt(match[1], 10);
            const date = new Date(match[2].trim());
            if (Number.isFinite(pid) && !Number.isNaN(date.getTime())) result.set(pid, date);
        }
    } catch {
        // Return partial/empty data, matching the synchronous helper.
    }
    return result;
}

/**
 * Capture and enrich relevant processes without blocking the event loop.
 * One base process listing is shared by every requested executable name.
 */
export async function captureProcessSnapshot(namePatterns: readonly string[]): Promise<ProcessInfo[]> {
    const names = normalizedProcessNames(
        namePatterns.filter((name) => Boolean(name) && VALID_EXECUTABLE_NAME.test(name)),
    );
    if (names.size === 0) return [];

    try {
        const output = await execFileText('ps', ['-axo', 'pid=,ppid=,tty=,command=']);
        const processes = parseProcessList(output, names);
        const pids = processes.map((process) => process.pid);
        const [cwdMap, startTimeMap] = await Promise.all([
            batchGetProcessCwdsAsync(pids),
            batchGetProcessStartTimesAsync(pids),
        ]);
        return processes.map((process) => ({
            ...process,
            cwd: cwdMap.get(process.pid) || '',
            startTime: startTimeMap.get(process.pid),
        }));
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

function isSameTerminalProcess(proc: ProcessInfo, matched: ProcessInfo): boolean {
    const sameTty = proc.tty !== '' && proc.tty !== '?' && proc.tty === matched.tty;
    const sameCwd = proc.cwd !== '' && proc.cwd === matched.cwd;

    return sameTty && (sameCwd || proc.cwd === '' || matched.cwd === '');
}

function matchesProcessIdentity(proc: ProcessInfo, matched: ProcessInfo): boolean {
    return proc.pid === matched.pid || isSameTerminalProcess(proc, matched);
}

export function findWrapperProcess(
    processes: ProcessInfo[],
    child: ProcessInfo,
): ProcessInfo | undefined {
    return processes.find((proc) => (
        proc.pid !== child.pid &&
        child.ppid === proc.pid &&
        matchesProcessIdentity(proc, child)
    ));
}

/**
 * Find parent wrapper processes that should not be reported as separate agents.
 *
 * A process is considered a wrapper when it is the parent of another candidate
 * agent process in the same terminal/worktree, or when it points at the same
 * terminal/worktree as an already session-matched process.
 */
export function findWrapperProcessPids(
    processes: ProcessInfo[],
    matchedProcesses: ProcessInfo[] = [],
): Set<number> {
    const wrappers = new Set<number>();

    for (const child of processes) {
        const wrapper = findWrapperProcess(processes, child);
        if (wrapper) {
            wrappers.add(wrapper.pid);
        }
    }

    for (const proc of processes) {
        if (matchedProcesses.some((matched) => (
            proc.pid !== matched.pid && isSameTerminalProcess(proc, matched)
        ))) {
            wrappers.add(proc.pid);
        }
    }

    return wrappers;
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
