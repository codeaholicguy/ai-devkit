import type { AgentInfo } from '../adapters/AgentAdapter.js';
import type { TerminalLocation } from '../terminal/TerminalFocusManager.js';
import type { AgentRuntimeProvider } from '../utils/AgentRegistry.js';

export type AgentRuntimeAvailability =
    | { ok: true; insideRuntime: boolean; currentPaneId?: string }
    | { ok: false; reason: 'binary-missing' | 'backend-unreachable'; detail: string };

export interface RuntimeStartInput {
    name: string;
    cwd: string;
    kind: string;
    args: string[];
    timeoutMs: number;
}

export interface RuntimeStartResult {
    pid: number;
    runtimeRef: unknown;
}

export interface RuntimeTargetInput {
    agent: Pick<AgentInfo, 'name' | 'pid'>;
    runtimeRef: unknown | null;
}

export interface RuntimeSendInput extends RuntimeTargetInput {
    prompt: string;
}

export interface RuntimeFocusInput extends RuntimeTargetInput {
    focusManager: {
        findTerminal(pid: number): Promise<TerminalLocation | null>;
        focusTerminal(location: TerminalLocation): Promise<boolean>;
    };
}

export interface RuntimeStopInput extends RuntimeTargetInput {
    killProcess?: (pid: number, signal: NodeJS.Signals) => void;
}

export interface RuntimeSendDeps {
    focusManager: {
        findTerminal(pid: number): Promise<TerminalLocation | null>;
    };
    writer?: (location: TerminalLocation, text: string) => Promise<void>;
}

export interface InteractiveAgentRuntime {
    provider: AgentRuntimeProvider;
    isAvailable(): Promise<AgentRuntimeAvailability>;
    startAgent(input: RuntimeStartInput): Promise<RuntimeStartResult>;
    send(input: RuntimeSendInput, deps?: RuntimeSendDeps): Promise<void>;
    focus(input: RuntimeFocusInput): Promise<boolean>;
    stop(input: RuntimeStopInput): Promise<void>;
}
