import {
  AGENTS,
  AgentStatus,
  type AgentAdapter,
  type AgentInfo,
  type AgentManager,
  type AgentRegistry,
  type AgentType,
  type ConversationMessage,
  type RegistryEntry,
  type StartableAgentType,
  type TmuxManager,
} from '@ai-devkit/agent-manager';
import { sleep } from '../../util/time.js';

export interface AgentSendWaitTarget {
  id: string;
  name: string;
  type: AgentType;
  pid: number;
  sessionId: string;
  sessionFilePath: string;
}

export interface AgentSendWaitOptions {
  pollIntervalMs: number;
  maxWaitMs: number;
  timeoutLabel?: string;
}

export interface AgentSendWaitResult {
  agentName: string;
  agentType: AgentType;
  pid: number;
  sessionId: string;
  sessionFilePath: string;
  messages: ConversationMessage[];
  finalStatus: AgentStatus;
  elapsedMs: number;
}

export interface WaitForAgentResponseParams {
  manager: Pick<AgentManager, 'listAgents'>;
  adapter: Pick<AgentAdapter, 'getConversation'>;
  target: AgentSendWaitTarget;
  initialMessageCount: number;
  options: AgentSendWaitOptions;
  onAssistantMessage: (message: ConversationMessage) => void;
  onStatus?: (message: string) => void;
}

function findSameAgent(target: AgentSendWaitTarget, agents: AgentInfo[]): AgentInfo | undefined {
  return agents.find((agent) => agent.pid === target.pid)
    ?? agents.find((agent) => agent.sessionId === target.sessionId && agent.type === target.type);
}

function readNewAssistantMessages(
  adapter: Pick<AgentAdapter, 'getConversation'>,
  sessionFilePath: string,
  lastSeenCount: number,
): { messages: ConversationMessage[]; nextSeenCount: number } {
  const conversation = adapter.getConversation(sessionFilePath, { verbose: false });
  const newMessages = conversation.slice(lastSeenCount);
  const assistantMessages = newMessages.filter((message) => (
    message.role === 'assistant' && Boolean(message.content)
  ));

  return {
    messages: assistantMessages,
    nextSeenCount: conversation.length,
  };
}

export async function waitForAgentResponse(params: WaitForAgentResponseParams): Promise<AgentSendWaitResult> {
  const { manager, adapter, target, initialMessageCount, options, onAssistantMessage, onStatus } = params;
  const startedAt = Date.now();
  let lastSeenCount = initialMessageCount;
  const messages: ConversationMessage[] = [];

  while (Date.now() - startedAt < options.maxWaitMs) {
    let transcriptReadSucceeded = false;
    try {
      const read = readNewAssistantMessages(adapter, target.sessionFilePath, lastSeenCount);
      lastSeenCount = read.nextSeenCount;
      transcriptReadSucceeded = true;

      for (const message of read.messages) {
        messages.push(message);
        onAssistantMessage(message);
      }
    } catch {
      // Transcript files can be observed mid-write. Treat read failures as
      // transient while the status loop still has time to prove completion.
    }

    const agents = await manager.listAgents();
    const agent = findSameAgent(target, agents);
    if (!agent) {
      throw new Error(`Agent "${target.name}" is no longer running.`);
    }

    const hasAssistantOutput = messages.length > 0;
    const canCompleteOnStatus =
      agent.status === AgentStatus.WAITING ||
      (agent.status === AgentStatus.IDLE && hasAssistantOutput);

    if (canCompleteOnStatus && transcriptReadSucceeded) {
      if (messages.length === 0) {
        onStatus?.(`Agent "${target.name}" returned to waiting without assistant output.`);
      }

      return {
        agentName: target.name,
        agentType: target.type,
        pid: target.pid,
        sessionId: target.sessionId,
        sessionFilePath: target.sessionFilePath,
        messages,
        finalStatus: agent.status,
        elapsedMs: Date.now() - startedAt,
      };
    }

    const elapsedMs = Date.now() - startedAt;
    const remainingMs = options.maxWaitMs - elapsedMs;
    await sleep(Math.min(options.pollIntervalMs, remainingMs));
  }

  throw new Error(`Timed out waiting for agent "${target.name}" after ${options.timeoutLabel ?? `${options.maxWaitMs}ms`}.`);
}

export const DEFAULT_PID_POLL_INTERVAL_MS = 500;
export const DEFAULT_PID_POLL_TIMEOUT_MS = 5_000;

export interface StartAgentOptions {
  type: StartableAgentType;
  name: string;
  cwd: string;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

export interface StartAgentDeps {
  tmux: TmuxManager;
  registry: AgentRegistry;
  /** Called for non-fatal events (e.g., replacing an orphan tmux session). */
  onWarning?: (message: string) => void;
}

export class TmuxUnavailableError extends Error {
  constructor() {
    super('tmux is not installed or not in PATH.');
    this.name = 'TmuxUnavailableError';
  }
}

export class AgentNameInUseError extends Error {
  constructor(public agentName: string, public pid: number) {
    super(`Agent "${agentName}" is already running (PID ${pid}).`);
    this.name = 'AgentNameInUseError';
  }
}

export class AgentPidPollTimeoutError extends Error {
  constructor(public agentName: string, public command: string, public timeoutMs: number) {
    super(`Agent process not found after ${timeoutMs / 1000}s.`);
    this.name = 'AgentPidPollTimeoutError';
  }
}

/**
 * Orchestrate `agent start`: ensure tmux is available, drop stale state,
 * create the session, send the launch command, poll for the real agent PID,
 * and register the entry. On poll timeout the tmux session is torn down so no
 * orphan is left behind.
 *
 * Callers are responsible for input-format validation (name regex, cwd existence)
 * before invoking this service.
 */
export async function startAgent(
  opts: StartAgentOptions,
  deps: StartAgentDeps,
): Promise<RegistryEntry> {
  const { tmux, registry, onWarning } = deps;
  const agent = AGENTS[opts.type];
  const intervalMs = opts.pollIntervalMs ?? DEFAULT_PID_POLL_INTERVAL_MS;
  const timeoutMs = opts.pollTimeoutMs ?? DEFAULT_PID_POLL_TIMEOUT_MS;

  if (!await tmux.isAvailable()) {
    throw new TmuxUnavailableError();
  }

  registry.prune();
  const existing = registry.lookup(opts.name);
  if (existing) {
    throw new AgentNameInUseError(opts.name, existing.pid);
  }

  if (await tmux.sessionExists(opts.name)) {
    onWarning?.(
      `tmux session "${opts.name}" already exists but has no live registry entry — it will be replaced.`,
    );
    await tmux.killSession(opts.name);
  }

  await tmux.createSession(opts.name, opts.cwd);
  await tmux.sendKeys(opts.name, agent.command);

  const agentPid = await pollForPid(tmux, opts.name, agent.matches, intervalMs, timeoutMs);
  if (agentPid === null) {
    await tmux.killSession(opts.name);
    throw new AgentPidPollTimeoutError(opts.name, agent.command, timeoutMs);
  }

  const entry: RegistryEntry = {
    name: opts.name,
    type: opts.type,
    pid: agentPid,
    tmuxSession: opts.name,
    cwd: opts.cwd,
    startedAt: new Date().toISOString(),
    sessionId: '',
    sessionFilePath: '',
  };
  registry.register(entry);
  return entry;
}

async function pollForPid(
  tmux: TmuxManager,
  session: string,
  matches: (psCommand: string) => boolean,
  intervalMs: number,
  timeoutMs: number,
): Promise<number | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pid = await tmux.findAgentPid(session, matches);
    if (pid !== null) return pid;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}
