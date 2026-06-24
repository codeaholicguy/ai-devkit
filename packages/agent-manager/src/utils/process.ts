/**
 * Process Detection Utilities
 *
 * Shared shell command wrappers for detecting and inspecting running processes.
 * All execFileSync calls for process data live here — adapters must not call execFileSync directly.
 */

import * as path from 'path';
import { execFileSync } from 'child_process';
import type { ProcessInfo } from '../adapters/AgentAdapter.js';

type PowerShellJsonRecord = Record<string, unknown>;

function runPowerShell(script: string): string {
    return execFileSync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] },
    );
}

function parsePowerShellJson(output: string): PowerShellJsonRecord[] {
    const trimmed = output.trim();
    if (!trimmed) return [];

    const parsed: unknown = JSON.parse(trimmed);
    const rows = Array.isArray(parsed) ? parsed : [parsed];

    return rows.filter((row): row is PowerShellJsonRecord => (
        row !== null && typeof row === 'object' && !Array.isArray(row)
    ));
}

function getNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim()) return Number(value);
    return NaN;
}

function getString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function getWindowsCommandExecutable(command: string): string {
    const trimmed = command.trim();
    if (!trimmed) return '';

    const quoted = trimmed.match(/^"([^"]+)"/);
    if (quoted) return quoted[1];

    return trimmed.split(/\s+/)[0] || '';
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
    if (!namePattern || !/^[a-zA-Z0-9_-]+$/.test(namePattern)) {
        return [];
    }

    if (process.platform === 'win32') {
        try {
            const output = runPowerShell(
                'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress',
            );
            const lowerPattern = namePattern.toLowerCase();
            const processes: ProcessInfo[] = [];

            for (const row of parsePowerShellJson(output)) {
                const pid = getNumber(row.ProcessId);
                const ppid = getNumber(row.ParentProcessId);
                if (!Number.isFinite(pid) || !Number.isFinite(ppid)) continue;

                const executablePath = getString(row.ExecutablePath);
                const commandLine = getString(row.CommandLine);
                const executable = executablePath || getWindowsCommandExecutable(commandLine);
                const base = path.win32.basename(executable).toLowerCase();
                if (base !== lowerPattern && base !== `${lowerPattern}.exe`) {
                    continue;
                }

                processes.push({
                    pid,
                    ppid,
                    command: commandLine || executablePath,
                    cwd: '',
                    tty: '?',
                });
            }

            return processes;
        } catch {
            return [];
        }
    }

    try {
        const output = execFileSync('ps', ['-axo', 'pid=,ppid=,tty=,command='], { encoding: 'utf-8' });

        const lowerPattern = namePattern.toLowerCase();
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

            // Check that the executable basename matches exactly
            const executable = command.trim().split(/\s+/)[0] || '';
            const base = path.basename(executable).toLowerCase();
            if (base !== lowerPattern && base !== `${lowerPattern}.exe`) {
                continue;
            }

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

/**
 * Batch-get current working directories for multiple PIDs.
 *
 * Single `lsof -a -d cwd -Fn -p PID1,PID2,...` call.
 * Returns partial results — if lsof fails for one PID, others still return.
 */
export function batchGetProcessCwds(pids: number[]): Map<number, string> {
    const result = new Map<number, string>();
    if (pids.length === 0) return result;
    if (process.platform === 'win32') return result;

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

    if (process.platform === 'win32') {
        const safePids = pids.filter(pid => Number.isInteger(pid) && pid > 0);
        if (safePids.length === 0) return result;

        const filter = safePids.map(pid => `ProcessId = ${pid}`).join(' OR ');
        const script = `Get-CimInstance Win32_Process -Filter "${filter}" | Select-Object ProcessId,@{Name='StartTimeMs';Expression={([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds()}} | ConvertTo-Json -Compress`;

        try {
            const output = runPowerShell(script);
            for (const row of parsePowerShellJson(output)) {
                const pid = getNumber(row.ProcessId);
                const startTimeMs = getNumber(row.StartTimeMs);
                if (!Number.isFinite(pid) || !Number.isFinite(startTimeMs)) continue;

                const date = new Date(startTimeMs);
                if (!Number.isNaN(date.getTime())) {
                    result.set(pid, date);
                }
            }
        } catch {
            // Return whatever we have
        }

        return result;
    }

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
    if (process.platform === 'win32') return '?';

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
