import { TmuxManager } from "../../terminal/TmuxManager.js";
import { TtyWriter } from "../../terminal/TtyWriter.js";
import { AgentPidPollTimeoutError, AgentTerminalNotFoundError } from "../errors.js";
import { pollForPid } from "./PidPolling.js";
import { parseTmuxRuntimeRef } from "./TmuxRuntimeRef.js";
import type {
  AgentRuntimeAvailability,
  InteractiveAgentRuntime,
  RuntimeFocusInput,
  RuntimeSendDeps,
  RuntimeSendInput,
  RuntimeStartInput,
  RuntimeStartResult,
  RuntimeStopInput,
} from "../types.js";

export class TmuxAgentRuntime implements InteractiveAgentRuntime {
  readonly provider = "tmux" as const;
  private readonly tmux: TmuxManager;

  constructor(tmux: TmuxManager = new TmuxManager()) {
    this.tmux = tmux;
  }

  async isAvailable(): Promise<AgentRuntimeAvailability> {
    if (await this.tmux.isAvailable()) {
      return { ok: true, insideRuntime: Boolean(process.env.TMUX) };
    }
    return {
      ok: false,
      reason: "binary-missing",
      detail: "tmux is not installed or not in PATH.",
    };
  }

  async startAgent(
    input: RuntimeStartInput & {
      command?: string;
      matches?: (psCommand: string) => boolean;
      pollIntervalMs?: number;
    },
  ): Promise<RuntimeStartResult> {
    if (!input.command || !input.matches || input.pollIntervalMs === undefined) {
      throw new Error("Tmux start requires command, process matcher, and poll interval.");
    }

    if (await this.tmux.sessionExists(input.name)) {
      await this.tmux.killSession(input.name);
    }

    await this.tmux.createSession(input.name, input.cwd);
    await this.tmux.sendKeys(input.name, input.command);

    const pid = await pollForPid(
      this.tmux,
      input.name,
      input.matches,
      input.pollIntervalMs,
      input.timeoutMs,
    );
    if (pid === null) {
      await this.tmux.killSession(input.name);
      throw new AgentPidPollTimeoutError(input.name, input.command, input.timeoutMs);
    }

    return {
      pid,
      runtimeRef: { session: input.name },
    };
  }

  async send(input: RuntimeSendInput, deps?: RuntimeSendDeps): Promise<void> {
    if (!deps) {
      throw new Error("Tmux send requires terminal lookup dependencies.");
    }
    const location = await deps.focusManager.findTerminal(input.agent.pid);
    if (!location) {
      throw new AgentTerminalNotFoundError(input.agent.name, input.agent.pid);
    }
    await (deps.writer ?? TtyWriter.send)(location, input.prompt);
  }

  async focus(input: RuntimeFocusInput): Promise<boolean> {
    const location = await input.focusManager.findTerminal(input.agent.pid);
    if (!location) return false;
    return await input.focusManager.focusTerminal(location);
  }

  async stop(input: RuntimeStopInput): Promise<void> {
    const killProcess = input.killProcess ?? ((pid, signal) => process.kill(pid, signal));
    try {
      killProcess(input.agent.pid, "SIGTERM");
    } catch (error) {
      if (!isProcessAlreadyGone(error)) {
        throw error;
      }
    }

    const tmuxRef = parseTmuxRuntimeRef(input.runtimeRef);
    if (tmuxRef) {
      await this.tmux.killSession(tmuxRef.session);
    }
  }
}

function isProcessAlreadyGone(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ESRCH"
  );
}
