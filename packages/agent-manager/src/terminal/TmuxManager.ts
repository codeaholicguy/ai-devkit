import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class TmuxManager {
    async isAvailable(): Promise<boolean> {
        try {
            await execFileAsync('tmux', ['-V']);
            return true;
        } catch {
            return false;
        }
    }

    async sessionExists(name: string): Promise<boolean> {
        try {
            await execFileAsync('tmux', ['has-session', '-t', name]);
            return true;
        } catch {
            return false;
        }
    }

    async createSession(name: string, cwd: string): Promise<void> {
        await execFileAsync('tmux', ['new-session', '-d', '-s', name, '-c', cwd]);
    }

    async sendKeys(session: string, keys: string): Promise<void> {
        await execFileAsync('tmux', ['send-keys', '-t', session, keys, 'Enter']);
    }

    async killSession(name: string): Promise<void> {
        try {
            await execFileAsync('tmux', ['kill-session', '-t', name]);
        } catch {
            // Already gone — ignore
        }
    }

    /**
     * Find the actual agent process PID inside a tmux pane.
     *
     * Strategy: BFS the process tree, return the deepest descendant whose
     * `ps` command line is accepted by `matches`. The caller supplies the
     * matcher so this method has no agent-type knowledge.
     *
     * This handles two real-world process shapes:
     * - Wrapper case: shell → claude-wrapper (matches) → claude (matches, deeper)
     *   → returns the deeper one
     * - Subprocess case: shell → claude (matches) → MCP server child (doesn't match)
     *   → returns claude, not the subprocess
     *
     * Returns null when no descendant matches yet (agent still starting); the
     * caller's poll loop retries.
     */
    async findAgentPid(session: string, matches: (psCommand: string) => boolean): Promise<number | null> {
        const panePid = await this.getPanePid(session);
        if (panePid === null) return null;

        const visited = new Set<number>();
        const queue: number[] = [panePid];
        let deepestMatch: number | null = null;

        while (queue.length > 0) {
            const pid = queue.shift()!;
            if (visited.has(pid)) continue;
            visited.add(pid);

            if (pid !== panePid) {
                const command = await this.getProcessCommand(pid);
                if (command && matches(command)) {
                    deepestMatch = pid;
                }
            }

            const children = await this.pgrepChildren(pid);
            queue.push(...children);
        }

        return deepestMatch;
    }

    private async getPanePid(session: string): Promise<number | null> {
        try {
            const { stdout } = await execFileAsync('tmux', [
                'list-panes', '-t', session, '-F', '#{pane_pid}',
            ]);
            const panePid = parseInt(stdout.trim().split('\n')[0], 10);
            return isNaN(panePid) ? null : panePid;
        } catch {
            return null;
        }
    }

    private async pgrepChildren(pid: number): Promise<number[]> {
        try {
            const { stdout } = await execFileAsync('pgrep', ['-P', String(pid)]);
            return stdout
                .trim()
                .split('\n')
                .map((s) => parseInt(s, 10))
                .filter((n) => !isNaN(n));
        } catch {
            return [];
        }
    }

    private async getProcessCommand(pid: number): Promise<string | null> {
        try {
            const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'command=']);
            const trimmed = stdout.trim();
            return trimmed || null;
        } catch {
            return null;
        }
    }
}
