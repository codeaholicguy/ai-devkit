import { terminalBackendFor } from "./backends/index.js";
import type { TerminalLocation } from "./types.js";

export class TtyWriter {
  static async send(location: TerminalLocation, message: string): Promise<void> {
    const backend = terminalBackendFor(location.type);
    if (!backend) {
      throw new Error(
        `Cannot send input: unsupported terminal type "${location.type}". ` +
          "Supported: tmux, WezTerm, iTerm2, Terminal.app.",
      );
    }
    await backend.send(location, message);
  }

  static async sendKey(location: TerminalLocation, key: string): Promise<void> {
    const backend = terminalBackendFor(location.type);
    if (!backend) {
      throw new Error(
        `Cannot send key: unsupported terminal type "${location.type}". ` +
          "Supported: tmux, WezTerm, iTerm2, Terminal.app.",
      );
    }
    await backend.sendKey(location, key);
  }
}
