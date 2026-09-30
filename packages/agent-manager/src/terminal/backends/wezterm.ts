import { execFile } from "child_process";
import { promisify } from "util";
import { TerminalType, type TerminalBackend } from "../types.js";
import { CARRIAGE_RETURN, execFileWithInput, sleep } from "./shared.js";

const execFileAsync = promisify(execFile);

interface WeztermPaneEntry {
  pane_id?: number;
  tty_name?: string | null;
}

export const weztermBackend: TerminalBackend = {
  type: TerminalType.WEZTERM,
  label: "wezterm",

  async find(tty) {
    try {
      const { stdout } = await execFileAsync("wezterm", ["cli", "list", "--format", "json"]);
      const panes = JSON.parse(stdout) as WeztermPaneEntry[];
      if (!Array.isArray(panes)) return null;
      for (const pane of panes) {
        if (pane?.tty_name === tty && pane.pane_id != null) {
          return { type: TerminalType.WEZTERM, identifier: String(pane.pane_id), tty };
        }
      }
    } catch {
      // wezterm might not be installed, running, or returning valid JSON
    }
    return null;
  },

  async focus(location) {
    await execFileAsync("wezterm", ["cli", "activate-pane", "--pane-id", location.identifier]);
    return true;
  },

  async send(location, message) {
    await execFileWithInput(
      "wezterm",
      ["cli", "send-text", "--pane-id", location.identifier],
      message,
    );
    await sleep(150);
    await execFileAsync("wezterm", [
      "cli",
      "send-text",
      "--pane-id",
      location.identifier,
      "--no-paste",
      CARRIAGE_RETURN,
    ]);
  },

  async sendKey(location, key) {
    await execFileAsync("wezterm", [
      "cli",
      "send-text",
      "--pane-id",
      location.identifier,
      "--no-paste",
      key,
    ]);
  },
};
