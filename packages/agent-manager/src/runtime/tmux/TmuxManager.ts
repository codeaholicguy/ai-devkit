import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class TmuxManager {
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync("tmux", ["-V"]);
      return true;
    } catch {
      return false;
    }
  }

  async sessionExists(name: string): Promise<boolean> {
    try {
      await execFileAsync("tmux", ["has-session", "-t", name]);
      return true;
    } catch {
      return false;
    }
  }

  async createSession(name: string, cwd: string): Promise<void> {
    await execFileAsync("tmux", ["new-session", "-d", "-s", name, "-c", cwd]);
  }

  async sendKeys(session: string, keys: string): Promise<void> {
    await execFileAsync("tmux", ["send-keys", "-t", session, keys, "Enter"]);
  }

  async killSession(name: string): Promise<void> {
    try {
      await execFileAsync("tmux", ["kill-session", "-t", name]);
    } catch {
      // Already gone — ignore
    }
  }

  async findAgentPid(
    session: string,
    matches: (psCommand: string) => boolean,
  ): Promise<number | null> {
    const panePid = await this.getPanePid(session);
    if (panePid === null) return null;

    const visited = new Set<number>();
    const queue: number[] = [panePid];
    let deepestMatch: number | null = null;

    while (queue.length > 0) {
      const pid = queue.shift()!;
      if (visited.has(pid)) continue;
      visited.add(pid);

      const command = await this.getProcessCommand(pid);
      if (command && matches(command)) deepestMatch = pid;
      queue.push(...(await this.pgrepChildren(pid)));
    }

    return deepestMatch;
  }

  private async getPanePid(session: string): Promise<number | null> {
    try {
      const { stdout } = await execFileAsync("tmux", [
        "list-panes",
        "-t",
        session,
        "-F",
        "#{pane_pid}",
      ]);
      const panePid = Number.parseInt(stdout.trim().split("\n")[0], 10);
      return Number.isNaN(panePid) ? null : panePid;
    } catch {
      return null;
    }
  }

  private async pgrepChildren(pid: number): Promise<number[]> {
    try {
      const { stdout } = await execFileAsync("pgrep", ["-P", String(pid)]);
      return stdout
        .trim()
        .split("\n")
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => !Number.isNaN(value));
    } catch {
      return [];
    }
  }

  private async getProcessCommand(pid: number): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "command="]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
}
