import { getProcessTty } from "../utils/process.js";
import { TERMINAL_BACKENDS, terminalBackendFor } from "./backends/index.js";
import { TerminalType, type TerminalLocation } from "./types.js";

export { TerminalType };
export type { TerminalLocation };

/** Optional trace sink for terminal discovery and focus decisions. */
export type TerminalDebugLogger = (message: string) => void;

export class TerminalFocusManager {
  constructor(private readonly debug?: TerminalDebugLogger) {}

  async findTerminal(pid: number): Promise<TerminalLocation | null> {
    const tty = getProcessTty(pid);
    if (!tty || tty === "?") {
      this.debug?.(`findTerminal(pid=${pid}): no usable TTY, cannot resolve terminal`);
      return null;
    }

    const fullTty = `/dev/${tty}`;
    this.debug?.(`findTerminal(pid=${pid}): resolving terminal for ${fullTty}`);

    for (const backend of TERMINAL_BACKENDS) {
      const location = await backend.find(fullTty);
      if (location) {
        this.debug?.(`findTerminal: matched ${backend.label} (identifier=${location.identifier})`);
        return location;
      }
      this.debug?.(`findTerminal: ${backend.label} no match`);
    }

    this.debug?.("findTerminal: no emulator matched; returning UNKNOWN");
    return { type: TerminalType.UNKNOWN, identifier: "", tty: fullTty };
  }

  async focusTerminal(location: TerminalLocation): Promise<boolean> {
    this.debug?.(
      `focusTerminal: focusing ${location.type} (identifier=${location.identifier}, tty=${location.tty})`,
    );

    let success = false;
    try {
      success = (await terminalBackendFor(location.type)?.focus(location)) ?? false;
    } catch {
      success = false;
    }

    this.debug?.(`focusTerminal: ${success ? "succeeded" : "failed"} for ${location.type}`);
    return success;
  }
}
