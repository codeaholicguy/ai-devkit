import { execFile } from "child_process";
import { promisify } from "util";
import { TerminalType, type TerminalBackend } from "../types.js";
import { ESCAPE_BYTE, execFileWithInput, sleep } from "./shared.js";

const execFileAsync = promisify(execFile);

export const tmuxBackend: TerminalBackend = {
  type: TerminalType.TMUX,
  label: "tmux",

  async find(tty) {
    try {
      const { stdout } = await execFileAsync("tmux", [
        "list-panes",
        "-a",
        "-F",
        "#{pane_tty}|#{session_name}:#{window_index}.#{pane_index}",
      ]);
      for (const line of stdout.trim().split("\n")) {
        if (!line.trim()) continue;
        const [paneTty, identifier] = line.split("|");
        if (paneTty === tty && identifier) {
          return { type: TerminalType.TMUX, identifier, tty };
        }
      }
    } catch {
      // tmux might not be installed or running
    }
    return null;
  },

  async focus(location) {
    await execFileAsync("tmux", ["switch-client", "-t", location.identifier]);
    return true;
  },

  async send(location, message) {
    const bufferName = `ai-devkit-send-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await execFileWithInput("tmux", ["load-buffer", "-b", bufferName, "-"], message);
    await execFileAsync("tmux", [
      "paste-buffer",
      "-t",
      location.identifier,
      "-b",
      bufferName,
      "-p",
      "-d",
    ]);
    await sleep(150);
    await execFileAsync("tmux", ["send-keys", "-t", location.identifier, "Enter"]);
  },

  async sendKey(location, key) {
    await execFileAsync("tmux", [
      "send-keys",
      "-t",
      location.identifier,
      key === ESCAPE_BYTE ? "Escape" : key,
    ]);
  },
};
