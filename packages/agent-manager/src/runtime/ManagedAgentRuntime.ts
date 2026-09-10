import type { AgentInfo } from '../adapters/AgentAdapter.js';
import type { TerminalLocation } from '../terminal/TerminalFocusManager.js';
import { TmuxManager } from '../terminal/TmuxManager.js';
import { TtyWriter } from '../terminal/TtyWriter.js';
import {
    AgentRegistry,
    parseTmuxRuntimeRef,
    type AgentRuntimeProvider,
    type RegistryEntry,
} from '../utils/AgentRegistry.js';
import { AGENTS, type StartableAgentType } from '../utils/agents.js';
import { createHerdrRuntime, isHerdrRegistryEntry, type HerdrStartRuntime, type HerdrInteractiveRuntime } from './AgentRuntime.js';

export const DEFAULT_PID_POLL_INTERVAL_MS = 500;
export const DEFAULT_PID_POLL_TIMEOUT_MS = 15_000;
const REQUIRED_STABLE_PID_POLLS = 5;

export interface StartAgentOptions {
    type: StartableAgentType;
    name: string;
    cwd: string;
    runtimeProvider?: AgentRuntimeProvider;
    pollIntervalMs?: number;
    pollTimeoutMs?: number;
}

export interface StartAgentDeps {
    tmux?: TmuxManager;
    runtime?: HerdrStartRuntime;
    registry?: AgentRegistry;
    /** Called for non-fatal events (e.g., replacing an orphan tmux session). */
    onWarning?: (message: string) => void;
}

export interface StopAgentDeps {
    tmux?: Pick<TmuxManager, 'killSession'>;
    runtime?: HerdrInteractiveRuntime;
    registry?: Pick<AgentRegistry, 'lookup'>;
    killProcess?: (pid: number, signal: NodeJS.Signals) => void;
}

export interface StopAgentResult {
    agentName: string;
    pid: number;
    runtime: AgentRuntimeProvider;
    runtimeRef: unknown | null;
}

export interface FocusAgentDeps {
    runtime?: HerdrInteractiveRuntime;
    registry?: Pick<AgentRegistry, 'lookup'>;
    focusManager: {
        findTerminal(pid: number): Promise<TerminalLocation | null>;
        focusTerminal(location: TerminalLocation): Promise<boolean>;
    };
}

export type FocusAgentResult =
    | { focused: true }
    | { focused: false; reason: 'terminal-not-found' | 'focus-failed' };

export interface SendAgentPromptDeps {
    runtime?: HerdrInteractiveRuntime;
    registry?: Pick<AgentRegistry, 'lookup'>;
    focusManager: {
        findTerminal(pid: number): Promise<TerminalLocation | null>;
    };
    writer?: (location: TerminalLocation, text: string) => Promise<void>;
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

export class AgentRuntimeUnavailableError extends Error {
    constructor(public provider: AgentRuntimeProvider, public reason: string, public detail: string) {
        super(`${provider} runtime is unavailable (${reason}): ${detail}`);
        this.name = 'AgentRuntimeUnavailableError';
    }
}

export class AgentTerminalNotFoundError extends Error {
    constructor(public agentName: string, public pid: number) {
        super(`Cannot find terminal for agent "${agentName}" (PID: ${pid}).`);
        this.name = 'AgentTerminalNotFoundError';
    }
}

/**
 * Orchestrate `agent start`: ensure the configured runtime is available,
 * create the runtime session, detect the agent PID, and register the entry.
 * Callers are responsible for user input validation before invoking this.
 */
export async function startAgent(
    opts: StartAgentOptions,
    deps: StartAgentDeps = {},
): Promise<RegistryEntry> {
    const registry = deps.registry ?? AgentRegistry.default();
    const agent = AGENTS[opts.type];
    const intervalMs = opts.pollIntervalMs ?? DEFAULT_PID_POLL_INTERVAL_MS;
    const timeoutMs = opts.pollTimeoutMs ?? DEFAULT_PID_POLL_TIMEOUT_MS;
    const provider = opts.runtimeProvider ?? deps.runtime?.provider ?? 'tmux';

    if (provider === 'herdr') {
        return startAgentWithHerdr(opts, deps.runtime ?? createHerdrRuntime(), registry, timeoutMs);
    }

    const tmux = deps.tmux ?? new TmuxManager();
    if (!await tmux.isAvailable()) {
        throw new TmuxUnavailableError();
    }

    registry.prune();
    const existing = registry.lookup(opts.name);
    if (existing) {
        throw new AgentNameInUseError(opts.name, existing.pid);
    }

    if (await tmux.sessionExists(opts.name)) {
        deps.onWarning?.(
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
        runtime: 'tmux',
        runtimeRef: { session: opts.name },
        cwd: opts.cwd,
        startedAt: new Date().toISOString(),
        sessionId: '',
        sessionFilePath: '',
        pinned: false,
    };
    registry.register(entry);
    return entry;
}

export async function stopAgent(
    agent: Pick<AgentInfo, 'name' | 'pid'>,
    deps: StopAgentDeps = {},
): Promise<StopAgentResult> {
    const registry = deps.registry ?? AgentRegistry.default();
    const registryEntry = registry.lookup(agent.name);
    if (isHerdrRegistryEntry(registryEntry)) {
        await (deps.runtime ?? createHerdrRuntime()).stop({ runtimeRef: registryEntry.runtimeRef });
        return {
            agentName: agent.name,
            pid: agent.pid,
            runtime: 'herdr',
            runtimeRef: registryEntry.runtimeRef,
        };
    }

    const tmux = deps.tmux ?? new TmuxManager();
    const killProcess = deps.killProcess ?? ((pid, signal) => process.kill(pid, signal));
    const tmuxRuntimeRef = registryEntry?.runtime === 'tmux'
        ? parseTmuxRuntimeRef(registryEntry.runtimeRef)
        : null;

    try {
        killProcess(agent.pid, 'SIGTERM');
    } catch (error) {
        if (!isProcessAlreadyGone(error)) {
            throw error;
        }
    }

    if (tmuxRuntimeRef) {
        await tmux.killSession(tmuxRuntimeRef.session);
    }

    return {
        agentName: agent.name,
        pid: agent.pid,
        runtime: 'tmux',
        runtimeRef: registryEntry?.runtimeRef ?? null,
    };
}

export async function focusAgent(
    agent: Pick<AgentInfo, 'name' | 'pid'>,
    deps: FocusAgentDeps,
): Promise<FocusAgentResult> {
    const registry = deps.registry ?? AgentRegistry.default();
    const registryEntry = registry.lookup(agent.name);
    if (isHerdrRegistryEntry(registryEntry)) {
        const focused = await (deps.runtime ?? createHerdrRuntime()).focus({ runtimeRef: registryEntry.runtimeRef });
        return focused ? { focused: true } : { focused: false, reason: 'focus-failed' };
    }

    const location = await deps.focusManager.findTerminal(agent.pid);
    if (!location) return { focused: false, reason: 'terminal-not-found' };

    const focused = await deps.focusManager.focusTerminal(location);
    return focused ? { focused: true } : { focused: false, reason: 'focus-failed' };
}

export async function sendAgentPrompt(
    agent: Pick<AgentInfo, 'name' | 'pid'>,
    prompt: string,
    deps: SendAgentPromptDeps,
): Promise<void> {
    const registry = deps.registry ?? AgentRegistry.default();
    const registryEntry = registry.lookup(agent.name);

    if (isHerdrRegistryEntry(registryEntry)) {
        await (deps.runtime ?? createHerdrRuntime()).send({ runtimeRef: registryEntry.runtimeRef, prompt });
        return;
    }

    const location = await deps.focusManager.findTerminal(agent.pid);
    if (!location) {
        throw new AgentTerminalNotFoundError(agent.name, agent.pid);
    }

    await (deps.writer ?? TtyWriter.send)(location, prompt);
}

async function startAgentWithHerdr(
    opts: StartAgentOptions,
    runtime: HerdrStartRuntime,
    registry: AgentRegistry,
    timeoutMs: number,
): Promise<RegistryEntry> {
    const availability = await runtime.isAvailable();
    if (!availability.ok) {
        throw new AgentRuntimeUnavailableError(runtime.provider, availability.reason, availability.detail);
    }

    registry.prune();
    const existing = registry.lookup(opts.name);
    if (existing) {
        throw new AgentNameInUseError(opts.name, existing.pid);
    }

    const result = await runtime.startAgent({
        name: opts.name,
        cwd: opts.cwd,
        kind: herdrAgentKind(opts.type),
        args: [],
        timeoutMs,
    });

    const entry: RegistryEntry = {
        name: opts.name,
        type: opts.type,
        pid: result.pid,
        runtime: runtime.provider,
        runtimeRef: result.runtimeRef,
        cwd: opts.cwd,
        startedAt: new Date().toISOString(),
        sessionId: '',
        sessionFilePath: '',
        pinned: false,
    };
    registry.register(entry);
    return entry;
}

function herdrAgentKind(type: StartableAgentType): string {
    return {
        claude: 'claude',
        codex: 'codex',
        copilot: 'copilot',
        gemini_cli: 'gemini',
        grok_cli: 'grok',
        opencode: 'opencode',
        pi: 'pi',
    }[type];
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

            if (stablePolls >= REQUIRED_STABLE_PID_POLLS) return pid;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return null;
}

function isProcessAlreadyGone(error: unknown): boolean {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as NodeJS.ErrnoException).code === 'ESRCH';
}
