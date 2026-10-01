export enum TerminalType {
  TMUX = "tmux",
  WEZTERM = "wezterm",
  GHOSTTY = "ghostty",
  ITERM2 = "iterm2",
  TERMINAL_APP = "terminal-app",
  UNKNOWN = "unknown",
}

export interface TerminalLocation {
  type: TerminalType;
  identifier: string;
  tty: string;
}

export interface TerminalBackend {
  readonly type: Exclude<TerminalType, TerminalType.UNKNOWN>;
  readonly label: string;
  find(tty: string): Promise<TerminalLocation | null>;
  focus(location: TerminalLocation): Promise<boolean>;
  send(location: TerminalLocation, message: string): Promise<void>;
  sendKey(location: TerminalLocation, key: string): Promise<void>;
}
