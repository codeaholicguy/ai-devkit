import {
  AGENTS,
  AgentStatus,
  TtyWriter,
  type AgentAdapter,
  type AgentInfo,
  type AgentManager,
  type AgentRegistry,
  type TerminalFocusManager,
  type TerminalLocation,
  type AgentType,
  type ConversationMessage,
  type RegistryEntry,
  type StartableAgentType,
  type TmuxManager,
} from '@ai-devkit/agent-manager';
import { createLogger } from '../../util/debug.js';
import { parseMilliseconds, sleep } from '../../util/time.js';
import { ui } from '../../util/terminal-ui.js';
import type { AgentGroup } from './agent-group.service.js';

const debug = createLogger('agent');

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

export interface SendReporter {
  info(message: string): void;
  warning(message: string): void;
  success(message: string): void;
  error(message: string): void;
}

interface GroupTarget {
  member: string;
  agent: AgentInfo;
}

export interface SendToAgentOptions {
  id: string;
  prompt: string;
  manager: Pick<AgentManager, 'listAgents' | 'resolveAgent' | 'getAdapter'>;
  focusManager: Pick<TerminalFocusManager, 'findTerminal'>;
  wait?: boolean;
  timeout?: string;
  json?: boolean;
  reporter?: SendReporter;
  writer?: typeof TtyWriter.send;
  writeWaitStatus?: (message: string) => void;
  writeAssistantMessage?: (message: ConversationMessage) => void;
  writeJson?: (value: object) => void;
}

export interface SendToAgentGroupOptions {
  group: AgentGroup;
  prompt: string;
  manager: Pick<AgentManager, 'listAgents' | 'resolveAgent'>;
  focusManager: Pick<TerminalFocusManager, 'findTerminal'>;
  reporter?: SendReporter;
  writer?: typeof TtyWriter.send;
}

export function assertSendTargetOptions(options: { id?: string; group?: string; wait?: boolean; timeout?: string; json?: boolean }): void {
  const targetCount = Number(Boolean(options.id)) + Number(Boolean(options.group));
  if (targetCount !== 1) {
    throw new Error('Use exactly one of --id or --group.');
  }
  if (options.group && options.wait) {
    throw new Error('Use --wait only with --id; group wait mode is not supported.');
  }
  if (options.group && options.timeout !== undefined) {
    throw new Error('Use --timeout only with --id --wait; group wait mode is not supported.');
  }
  if (options.group && options.json) {
    throw new Error('Use --json only with --id --wait; group JSON output is not supported.');
  }
  if (options.timeout !== undefined && !options.wait) {
    throw new Error('Use --timeout only with --wait.');
  }
  if (options.timeout !== undefined) {
    parseSendWaitTimeout(options.timeout);
  }
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

export async function sendToAgent({
  id,
  prompt,
  manager,
  focusManager,
  wait = false,
  timeout,
  json = false,
  reporter = ui,
  writer = TtyWriter.send,
  writeWaitStatus = (message) => process.stderr.write(`${message}\n`),
  writeAssistantMessage = (message) => process.stdout.write(`${message.content}\n`),
  writeJson = (value) => console.log(JSON.stringify(value, null, 2)),
}: SendToAgentOptions): Promise<void> {
  const waitTimeout = parseSendWaitTimeout(timeout);
  const agents = await manager.listAgents();
  if (agents.length === 0) {
    reporter.error('No running agents found.');
    return;
  }

  const resolved = manager.resolveAgent(id, agents);
  if (!resolved) {
    reporter.error(`No agent found matching "${id}".`);
    reporter.info('Available agents:');
    agents.forEach((agent) => reporter.info(`  - ${agent.name}`));
    return;
  }

  if (Array.isArray(resolved)) {
    reporter.error(`Multiple agents match "${id}":`);
    resolved.forEach((agent) => reporter.info(`  - ${agent.name} (${formatStatus(agent.status)})`));
    reporter.info('Please use a more specific identifier.');
    return;
  }

  const agent = resolved;
  if (![AgentStatus.WAITING, AgentStatus.IDLE].includes(agent.status)) {
    const warning = `Agent "${agent.name}" is not waiting for input (status: ${agent.status}). Sending anyway.`;
    if (wait) {
      writeWaitStatus(warning);
    } else {
      reporter.warning(warning);
    }
  }

  const waitContext = wait ? prepareWaitMode(manager, agent) : undefined;
  const location = await focusManager.findTerminal(agent.pid);
  if (!location) {
    if (wait) {
      throw new Error(`Cannot find terminal for agent "${agent.name}" (PID: ${agent.pid}).`);
    }
    reporter.error(`Cannot find terminal for agent "${agent.name}" (PID: ${agent.pid}).`);
    return;
  }

  await writer(location, prompt);

  if (!wait) {
    reporter.success(`Sent message to ${agent.name}.`);
    return;
  }

  if (!waitContext) {
    throw new Error('Wait mode was not prepared.');
  }

  const waitResult = await waitForAgentResponse({
    manager,
    adapter: waitContext.adapter,
    target: {
      id,
      name: agent.name,
      type: agent.type,
      pid: agent.pid,
      sessionId: agent.sessionId,
      sessionFilePath: waitContext.sessionFilePath,
    },
    initialMessageCount: waitContext.initialMessageCount,
    options: {
      pollIntervalMs: AGENT_SEND_WAIT_POLL_INTERVAL_MS,
      maxWaitMs: waitTimeout.maxWaitMs,
      timeoutLabel: waitTimeout.label,
    },
    onAssistantMessage: (message) => {
      if (!json) writeAssistantMessage(message);
    },
    onStatus: writeWaitStatus,
  });

  if (json) {
    writeJson(toAgentSendWaitJson(waitResult, agent, prompt, id));
  }
}

export async function sendToAgentGroup({
  group,
  prompt,
  manager,
  focusManager,
  reporter = ui,
  writer = TtyWriter.send,
}: SendToAgentGroupOptions): Promise<void> {
  if (group.members.length === 0) {
    throw new Error(`Agent group "${group.name}" has no members.`);
  }

  const agents = await manager.listAgents();
  if (agents.length === 0) {
    reporter.error('No running agents found.');
    process.exitCode = 1;
    return;
  }

  const resolution = resolveGroupTargets(group, agents, manager);
  if (resolution.errors.length > 0) {
    reportResolutionErrors(group.name, resolution.errors, reporter);
    process.exitCode = 1;
    return;
  }

  const targets = dedupeTargets(resolution.targets, reporter);
  await deliverGroupMessage({
    groupName: group.name,
    targets,
    prompt,
    focusManager,
    reporter,
    writer,
  });
}

function parseSendWaitTimeout(value: string | undefined): { maxWaitMs: number; label?: string } {
  try {
    const parsed = parseMilliseconds(value, AGENT_SEND_WAIT_MAX_WAIT_MS);
    return { maxWaitMs: parsed.milliseconds, label: parsed.label };
  } catch (error) {
    throw new Error(`Invalid --timeout. ${(error as Error).message} Example: 30000.`);
  }
}

function prepareWaitMode(manager: Pick<AgentManager, 'getAdapter'>, agent: AgentInfo): {
  adapter: AgentAdapter;
  sessionFilePath: string;
  initialMessageCount: number;
} {
  if (!agent.sessionFilePath) {
    throw new Error(`No session file found for agent "${agent.name}"; cannot wait for response.`);
  }

  const adapter = manager.getAdapter(agent.type);
  if (!adapter) {
    throw new Error(`Unsupported agent type: ${agent.type}`);
  }

  return {
    adapter,
    sessionFilePath: agent.sessionFilePath,
    initialMessageCount: adapter.getConversation(agent.sessionFilePath, { verbose: false }).length,
  };
}

function toAgentSendWaitJson(result: AgentSendWaitResult, agent: AgentInfo, prompt: string, targetId: string): object {
  return {
    target: {
      id: targetId,
      name: agent.name,
      type: agent.type,
      pid: agent.pid,
      status: agent.status,
      summary: agent.summary,
      projectPath: agent.projectPath,
      sessionId: agent.sessionId,
      sessionFilePath: result.sessionFilePath,
      lastActive: agent.lastActive,
    },
    prompt,
    responseMessages: result.messages,
    elapsedMs: result.elapsedMs,
    finalStatus: result.finalStatus,
  };
}

function formatStatus(status: AgentStatus): string {
  const label = {
    [AgentStatus.RUNNING]: 'run',
    [AgentStatus.WAITING]: 'wait',
    [AgentStatus.IDLE]: 'idle',
    [AgentStatus.UNKNOWN]: 'unknown',
  }[status] ?? 'unknown';
  return `${statusEmoji(status)} ${label}`;
}

function statusEmoji(status: AgentStatus): string {
  return {
    [AgentStatus.RUNNING]: '\u{1F7E2}',
    [AgentStatus.WAITING]: '\u{1F7E1}',
    [AgentStatus.IDLE]: '\u{26AA}',
    [AgentStatus.UNKNOWN]: '\u{2753}',
  }[status] ?? '\u{2753}';
}

function resolveGroupTargets(
  group: AgentGroup,
  agents: AgentInfo[],
  manager: Pick<AgentManager, 'resolveAgent'>,
): { targets: GroupTarget[]; errors: string[] } {
  const targets: GroupTarget[] = [];
  const errors: string[] = [];

  for (const member of group.members) {
    const resolved = manager.resolveAgent(member, agents);
    if (!resolved) {
      errors.push(`  - ${member}: no running agent matched`);
      continue;
    }
    if (Array.isArray(resolved)) {
      errors.push(`  - ${member}: matched multiple agents (${resolved.map((agent) => agent.name).join(', ')})`);
      continue;
    }
    targets.push({ member, agent: resolved });
  }

  return { targets, errors };
}

function reportResolutionErrors(groupName: string, errors: string[], reporter: SendReporter): void {
  reporter.error(`Cannot send to group "${groupName}" because some members could not be resolved.`);
  for (const error of errors) {
    reporter.error(error);
  }
}

function dedupeTargets(targets: GroupTarget[], reporter: SendReporter): GroupTarget[] {
  const uniqueTargets: GroupTarget[] = [];
  const seen = new Set<string>();

  for (const target of targets) {
    const key = targetKey(target.agent);
    if (seen.has(key)) {
      reporter.info(`Skipped duplicate target "${target.agent.name}" from group member "${target.member}".`);
      continue;
    }
    seen.add(key);
    uniqueTargets.push(target);
  }

  return uniqueTargets;
}

async function deliverGroupMessage(options: {
  groupName: string;
  targets: GroupTarget[];
  prompt: string;
  focusManager: Pick<TerminalFocusManager, 'findTerminal'>;
  reporter: SendReporter;
  writer: (location: TerminalLocation, message: string) => Promise<void>;
}): Promise<void> {
  let successCount = 0;
  let failureCount = 0;

  for (const { agent } of options.targets) {
    warnIfAgentIsBusy(agent, options.reporter);

    try {
      const location = await options.focusManager.findTerminal(agent.pid);
      if (!location) {
        throw new Error(`Cannot find terminal for agent "${agent.name}" (PID: ${agent.pid}).`);
      }
      await options.writer(location, options.prompt);
      successCount += 1;
      options.reporter.success(`Sent message to ${agent.name}.`);
    } catch (error) {
      failureCount += 1;
      options.reporter.error(`Failed to send to ${agent.name}: ${(error as Error).message}`);
    }
  }

  reportDeliverySummary(options.groupName, successCount, failureCount, options.reporter);
}

function warnIfAgentIsBusy(agent: AgentInfo, reporter: SendReporter): void {
  if (![AgentStatus.WAITING, AgentStatus.IDLE].includes(agent.status)) {
    reporter.warning(`Agent "${agent.name}" is not waiting for input (status: ${agent.status}). Sending anyway.`);
  }
}

function reportDeliverySummary(groupName: string, successCount: number, failureCount: number, reporter: SendReporter): void {
  if (failureCount > 0) {
    reporter.error(`Sent message to ${successCount} agent(s), failed for ${failureCount} agent(s) in group "${groupName}".`);
    process.exitCode = 1;
    return;
  }

  reporter.success(`Sent message to ${successCount} agent(s) in group "${groupName}".`);
}

function targetKey(agent: AgentInfo): string {
  return agent.pid ? `pid:${agent.pid}` : `name:${agent.name}`;
}

const AGENT_SEND_WAIT_POLL_INTERVAL_MS = 2000;
const AGENT_SEND_WAIT_MAX_WAIT_MS = 10 * 60 * 1000;

export const DEFAULT_PID_POLL_INTERVAL_MS = 500;
export const DEFAULT_PID_POLL_TIMEOUT_MS = 15_000;
const REQUIRED_STABLE_PID_POLLS = 5;

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

export interface KillAgentDeps {
  tmux: Pick<TmuxManager, 'killSession'>;
  registry: Pick<AgentRegistry, 'lookup'>;
  killProcess?: (pid: number, signal: NodeJS.Signals) => void;
}

export interface KillAgentResult {
  agentName: string;
  pid: number;
  tmuxSession: string | null;
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

function isProcessAlreadyGone(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ESRCH';
}

export async function killAgent(
  agent: Pick<AgentInfo, 'name' | 'pid'>,
  deps: KillAgentDeps,
): Promise<KillAgentResult> {
  const killProcess = deps.killProcess ?? ((pid, signal) => process.kill(pid, signal));
  const registryEntry = deps.registry.lookup(agent.name);
  const tmuxSession = registryEntry?.tmuxSession || null;

  try {
    killProcess(agent.pid, 'SIGTERM');
  } catch (error) {
    if (!isProcessAlreadyGone(error)) {
      throw error;
    }
  }

  if (tmuxSession) {
    await deps.tmux.killSession(tmuxSession);
  }

  return {
    agentName: agent.name,
    pid: agent.pid,
    tmuxSession,
  };
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

  debug(`startAgent: type=${opts.type}, name=${opts.name}, cwd=${opts.cwd}, pollTimeoutMs=${timeoutMs}`);

  if (!await tmux.isAvailable()) {
    debug('startAgent: tmux unavailable');
    throw new TmuxUnavailableError();
  }

  registry.prune();
  const existing = registry.lookup(opts.name);
  if (existing) {
    debug(`startAgent: name already in use pid=${existing.pid}`);
    throw new AgentNameInUseError(opts.name, existing.pid);
  }

  if (await tmux.sessionExists(opts.name)) {
    onWarning?.(
      `tmux session "${opts.name}" already exists but has no live registry entry — it will be replaced.`,
    );
    await tmux.killSession(opts.name);
  }

  debug(`startAgent: creating tmux session ${opts.name}`);
  await tmux.createSession(opts.name, opts.cwd);
  debug(`startAgent: sending launch command "${agent.command}"`);
  await tmux.sendKeys(opts.name, agent.command);

  const agentPid = await pollForPid(tmux, opts.name, agent.matches, intervalMs, timeoutMs);
  if (agentPid === null) {
    debug(`startAgent: PID poll timed out after ${timeoutMs}ms`);
    await tmux.killSession(opts.name);
    throw new AgentPidPollTimeoutError(opts.name, agent.command, timeoutMs);
  }
  debug(`startAgent: detected stable PID ${agentPid}`);

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
  debug(`startAgent: registered ${entry.name}`);
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
  let candidatePid: number | null = null;
  let stablePolls = 0;

  while (Date.now() < deadline) {
    const pid = await tmux.findAgentPid(session, matches);
    if (pid !== null) {
      if (pid === candidatePid) {
        stablePolls += 1;
      } else {
        candidatePid = pid;
        stablePolls = 1;
      }

      debug(`pollForPid: candidatePid=${pid}, stablePolls=${stablePolls}`);
      if (stablePolls >= REQUIRED_STABLE_PID_POLLS) return pid;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return null;
}
