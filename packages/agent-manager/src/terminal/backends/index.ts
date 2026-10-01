import type { TerminalBackend } from "../types.js";
import { TerminalType } from "../types.js";
import { ghosttyBackend } from "./ghostty.js";
import { iterm2Backend } from "./iterm2.js";
import { terminalAppBackend } from "./terminal-app.js";
import { tmuxBackend } from "./tmux.js";
import { weztermBackend } from "./wezterm.js";

export const TERMINAL_BACKENDS: readonly TerminalBackend[] = [
  tmuxBackend,
  weztermBackend,
  ghosttyBackend,
  iterm2Backend,
  terminalAppBackend,
];

const BACKENDS_BY_TYPE = new Map<TerminalType, TerminalBackend>(
  TERMINAL_BACKENDS.map((backend) => [backend.type, backend]),
);

export function terminalBackendFor(type: TerminalType): TerminalBackend | undefined {
  return BACKENDS_BY_TYPE.get(type);
}
