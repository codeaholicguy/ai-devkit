/**
 * Process Detection Utilities
 * 
 * Utilities for detecting and inspecting running processes on the system.
 * Primarily focused on macOS/Unix-like systems using the `ps` command.
 */

import { execSync } from 'child_process';
import type { ProcessInfo } from '../lib/adapters/AgentAdapter';

/**
 * Options for listing processes
 */
export interface ListProcessesOptions {
    /** Filter processes by name pattern (case-insensitive) */
    namePattern?: string;

    /** Include only processes matching these PIDs */
    pids?: number[];
}

/**
 * List running processes on the system
 * 
 * @param options Filtering options
 * @returns Array of process information
 * 
 * @example
 * ```typescript
 * // List all Claude Code processes
 * const processes = listProcesses({ namePattern: 'claude' });
 * 
 * // Get specific process info
 * const process = listProcesses({ pids: [12345] });
 * ```
 */
export function listProcesses(options: ListProcessesOptions = {}): ProcessInfo[] {
    try {
        // Get all processes with full details
        // Format: user pid command
        const psOutput = execSync('ps aux', { encoding: 'utf-8' });

        const lines = psOutput.trim().split('\n');
        // Skip header line
        const processLines = lines.slice(1);

        const processes: ProcessInfo[] = [];

        for (const line of processLines) {
            // Parse ps aux output
            // Format: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
            const parts = line.trim().split(/\s+/);

            if (parts.length < 11) continue;

            const pid = parseInt(parts[1], 10);
            if (isNaN(pid)) continue;

            const tty = parts[6];
            const command = parts.slice(10).join(' ');

            // Apply PID filter
            if (options.pids && !options.pids.includes(pid)) {
                continue;
            }

            // Apply name pattern filter (case-insensitive)
            if (options.namePattern) {
                const pattern = options.namePattern.toLowerCase();
                const commandLower = command.toLowerCase();
                if (!commandLower.includes(pattern)) {
                    continue;
                }
            }

            // Get working directory for this process
            const cwd = getProcessCwd(pid);

            // Get TTY in short format (remove /dev/ prefix if present)
            const ttyShort = tty.startsWith('/dev/') ? tty.slice(5) : tty;

            processes.push({
                pid,
                command,
                cwd,
                tty: ttyShort,
            });
        }

        return processes;
    } catch (error) {
        // If ps command fails, return empty array
        console.error('Failed to list processes:', error);
        return [];
    }
}

/**
 * Get the current working directory for a specific process
 * 
 * @param pid Process ID
 * @returns Working directory path, or empty string if unavailable
 */
export function getProcessCwd(pid: number): string {
    try {
        // Use lsof to get the current working directory
        // -a: AND the selections, -d cwd: get cwd only, -Fn: output format (file names only)
        const output = execSync(`lsof -a -p ${pid} -d cwd -Fn 2>/dev/null`, {
            encoding: 'utf-8',
        });

        // Parse lsof output
        // Format: p{PID}\nn{path}
        const lines = output.trim().split('\n');
        for (const line of lines) {
            if (line.startsWith('n')) {
                return line.slice(1); // Remove 'n' prefix
            }
        }

        return '';
    } catch (error) {
        // If lsof fails, try alternative method using pwdx (Linux)
        try {
            const output = execSync(`pwdx ${pid} 2>/dev/null`, {
                encoding: 'utf-8',
            });
            // Format: {PID}: {path}
            const match = output.match(/^\d+:\s*(.+)$/);
            return match ? match[1].trim() : '';
        } catch {
            // Both methods failed
            return '';
        }
    }
}

/**
 * Get the TTY device for a specific process
 * 
 * @param pid Process ID
 * @returns TTY device name (e.g., "ttys030"), or "?" if unavailable
 */
export function getProcessTty(pid: number): string {
    try {
        const output = execSync(`ps -p ${pid} -o tty=`, {
            encoding: 'utf-8',
        });

        const tty = output.trim();
        // Remove /dev/ prefix if present
        return tty.startsWith('/dev/') ? tty.slice(5) : tty;
    } catch (error) {
        return '?';
    }
}

/**
 * Check if a process with the given PID is running
 * 
 * @param pid Process ID
 * @returns True if process is running
 */
export function isProcessRunning(pid: number): boolean {
    try {
        // Send signal 0 to check if process exists
        // This doesn't actually send a signal, just checks if we can
        execSync(`kill -0 ${pid} 2>/dev/null`);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get detailed information for a specific process
 * 
 * @param pid Process ID
 * @returns Process information, or null if process not found
 */
export function getProcessInfo(pid: number): ProcessInfo | null {
    const processes = listProcesses({ pids: [pid] });
    return processes.length > 0 ? processes[0] : null;
}
