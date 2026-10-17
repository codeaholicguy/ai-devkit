import type { AgentRuntimeProvider } from "../utils/AgentRegistry.js";

export class TmuxUnavailableError extends Error {
  constructor() {
    super("tmux is not installed or not in PATH.");
    this.name = "TmuxUnavailableError";
  }
}

export class AgentNameInUseError extends Error {
  constructor(
    public agentName: string,
    public pid: number,
  ) {
    super(`Agent "${agentName}" is already running (PID ${pid}).`);
    this.name = "AgentNameInUseError";
  }
}

export class AgentPidPollTimeoutError extends Error {
  constructor(
    public agentName: string,
    public command: string,
    public timeoutMs: number,
  ) {
    super(`Agent process not found after ${timeoutMs / 1000}s.`);
    this.name = "AgentPidPollTimeoutError";
  }
}

export class AgentRuntimeUnavailableError extends Error {
  constructor(
    public provider: AgentRuntimeProvider,
    public reason: string,
    public detail: string,
  ) {
    super(`${provider} runtime is unavailable (${reason}): ${detail}`);
    this.name = "AgentRuntimeUnavailableError";
  }
}

export class AgentTerminalNotFoundError extends Error {
  constructor(
    public agentName: string,
    public pid: number,
  ) {
    super(`Cannot find terminal for agent "${agentName}" (PID: ${pid}).`);
    this.name = "AgentTerminalNotFoundError";
  }
}

export class AgentHomeDivergenceError extends Error {
  constructor(
    public envHome: string,
    public accountHome: string,
  ) {
    super(
      `Refusing to start under divergent HOME: this process resolves HOME="${envHome}" ` +
        `but the account home is "${accountHome}" — where the agent registry and devkitd ` +
        "socket live. A registry write here would be invisible to the daemon and other " +
        'clients, so the agent would list under a synthesized "unregistered:<cwd>-<pid>" ' +
        "identity. Unset HOME or start the agent from a non-sandboxed environment.",
    );
    this.name = "AgentHomeDivergenceError";
  }
}
