import type { AgentInfo } from '../adapters/AgentAdapter.js';
import type { TerminalLocation } from '../terminal/TerminalFocusManager.js';
import { TmuxManager } from '../terminal/TmuxManager.js';
import {
    AgentRegistry,
    type AgentRuntimeProvider,
    type RegistryEntry,
} from '../utils/AgentRegistry.js';
import { AGENTS, type StartableAgentType } from '../utils/agents.js';
import { createInteractiveRuntime } from './RuntimeFactory.js';
import {
    DEFAULT_PID_POLL_INTERVAL_MS,
    DEFAULT_PID_POLL_TIMEOUT_MS,
} from './tmux/PidPolling.js';
import { TmuxAgentRuntime } from './tmux/TmuxAgentRuntime.js';
import type { InteractiveAgentRuntime } from './types.js';
import {
    AgentNameInUseError,
    AgentPidPollTimeoutError,
    AgentRuntimeUnavailableError,
    AgentTerminalNotFoundError,
    TmuxUnavailableError,
} from './errors.js';

export {
    AgentNameInUseError,
    AgentPidPollTimeoutError,
    AgentRuntimeUnavailableError,
    AgentTerminalNotFoundError,
    TmuxUnavailableError,
};
export { DEFAULT_PID_POLL_INTERVAL_MS, DEFAULT_PID_POLL_TIMEOUT_MS };

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
    runtime?: InteractiveAgentRuntime;
    registry?: AgentRegistry;
    /** Called for non-fatal events (e.g., replacing an orphan tmux session). */
    onWarning?: (message: string) => void;
}

export interface StopAgentDeps {
    tmux?: Pick<TmuxManager, 'killSession'>;
    runtime?: InteractiveAgentRuntime;
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
    runtime?: InteractiveAgentRuntime;
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
    runtime?: InteractiveAgentRuntime;
    registry?: Pick<AgentRegistry, 'lookup'>;
    focusManager: {
        findTerminal(pid: number): Promise<TerminalLocation | null>;
    };
    writer?: (location: TerminalLocation, text: string) => Promise<void>;
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
    const tmux = provider === 'tmux' ? deps.tmux ?? new TmuxManager() : undefined;
    const runtime = resolveStartRuntime(provider, { ...deps, tmux });

    const availability = await runtime.isAvailable();
    if (!availability.ok) {
        if (provider === 'tmux') throw new TmuxUnavailableError();
        throw new AgentRuntimeUnavailableError(provider, availability.reason, availability.detail);
    }

    registry.prune();
    const existing = registry.lookup(opts.name);
    if (existing) {
        throw new AgentNameInUseError(opts.name, existing.pid);
    }

    if (provider === 'tmux' && tmux && await tmux.sessionExists(opts.name)) {
        deps.onWarning?.(
            `tmux session "${opts.name}" already exists but has no live registry entry — it will be replaced.`,
        );
    }

    const result = await runtime.startAgent({
        name: opts.name,
        cwd: opts.cwd,
        kind: agentRuntimeKind(opts.type, provider),
        args: [],
        timeoutMs,
        ...(provider === 'tmux' ? {
            command: agent.command,
            matches: agent.matches,
            pollIntervalMs: intervalMs,
        } : {}),
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

export async function stopAgent(
    agent: Pick<AgentInfo, 'name' | 'pid'>,
    deps: StopAgentDeps = {},
): Promise<StopAgentResult> {
    const registry = deps.registry ?? AgentRegistry.default();
    const registryEntry = registry.lookup(agent.name);
    const runtime = resolveRuntimeForEntry(registryEntry, deps);
    const runtimeRef = registryEntry?.runtimeRef ?? null;

    await runtime.stop({
        agent,
        runtimeRef,
        killProcess: deps.killProcess,
    });

    return {
        agentName: agent.name,
        pid: agent.pid,
        runtime: runtime.provider,
        runtimeRef,
    };
}

export async function focusAgent(
    agent: Pick<AgentInfo, 'name' | 'pid'>,
    deps: FocusAgentDeps,
): Promise<FocusAgentResult> {
    const registry = deps.registry ?? AgentRegistry.default();
    const registryEntry = registry.lookup(agent.name);
    const runtime = resolveRuntimeForEntry(registryEntry, deps);
    if (runtime.provider === 'tmux') {
        const location = await deps.focusManager.findTerminal(agent.pid);
        if (!location) return { focused: false, reason: 'terminal-not-found' };

        const focused = await deps.focusManager.focusTerminal(location);
        return focused ? { focused: true } : { focused: false, reason: 'focus-failed' };
    }

    const focused = await runtime.focus({
        agent,
        runtimeRef: registryEntry?.runtimeRef ?? null,
        focusManager: deps.focusManager,
    });

    if (focused) return { focused: true };
    return { focused: false, reason: 'focus-failed' };
}

export async function sendAgentPrompt(
    agent: Pick<AgentInfo, 'name' | 'pid'>,
    prompt: string,
    deps: SendAgentPromptDeps,
): Promise<void> {
    const registry = deps.registry ?? AgentRegistry.default();
    const registryEntry = registry.lookup(agent.name);
    const runtime = resolveRuntimeForEntry(registryEntry, deps);

    await runtime.send({
        agent,
        runtimeRef: registryEntry?.runtimeRef ?? null,
        prompt,
    }, {
        focusManager: deps.focusManager,
        writer: deps.writer,
    });
}

function resolveStartRuntime(provider: AgentRuntimeProvider, deps: StartAgentDeps): InteractiveAgentRuntime {
    if (deps.runtime && deps.runtime.provider === provider) {
        return deps.runtime;
    }
    if (provider === 'tmux') return new TmuxAgentRuntime(deps.tmux);
    return createInteractiveRuntime(provider);
}

function resolveRuntimeForEntry(
    registryEntry: RegistryEntry | null,
    deps: { runtime?: InteractiveAgentRuntime; tmux?: Pick<TmuxManager, 'killSession'> },
): InteractiveAgentRuntime {
    if (isHerdrRegistryEntry(registryEntry)) {
        return deps.runtime?.provider === 'herdr' ? deps.runtime : createInteractiveRuntime('herdr');
    }
    if (deps.runtime?.provider === 'tmux') return deps.runtime;
    return deps.tmux
        ? new TmuxAgentRuntime(deps.tmux as TmuxManager)
        : createInteractiveRuntime('tmux');
}

function isHerdrRegistryEntry(entry: unknown): entry is RegistryEntry & { runtime: 'herdr'; runtimeRef: unknown } {
    return typeof entry === 'object'
        && entry !== null
        && (entry as { runtime?: unknown }).runtime === 'herdr'
        && 'runtimeRef' in entry;
}

function agentRuntimeKind(type: StartableAgentType, provider: AgentRuntimeProvider): string {
    if (provider === 'tmux') return type;
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
