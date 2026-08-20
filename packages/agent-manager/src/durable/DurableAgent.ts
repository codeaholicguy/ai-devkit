export type DurableAgentState = 'ready' | 'running' | 'degraded';
export type DurableSessionHealth = 'uninitialized' | 'healthy' | 'unknown' | 'mismatch';
export type DurableRunStatus = 'succeeded' | 'failed' | 'interrupted';
export type PiPrintErrorCode =
    | 'PI_CLI_UNAVAILABLE'
    | 'PI_CLI_UNSUPPORTED'
    | 'PI_PROCESS'
    | 'PI_PROTOCOL'
    | 'PI_RESULT_MISSING'
    | 'PI_SESSION_MISMATCH'
    | 'PI_UNSUPPORTED';

export const AGENT_MODES = {
    INTERACTIVE: 'interactive',
    DURABLE: 'durable',
} as const;

export interface ProcessIdentity {
    pid: number;
    startedAt: string;
}

export interface DurableActiveRun {
    token: string;
    owner: ProcessIdentity;
    provider: ProcessIdentity | null;
    startedAt: string;
}

export interface DurableLastResult {
    status: DurableRunStatus;
    completedAt: string;
    exitCode: number | null;
    summary: string;
}

export type DurableProvider = 'claude' | 'codex' | 'pi';

export interface DurableAgentBase {
    id: string;
    name: string;
    mode: typeof AGENT_MODES.DURABLE;
    cwd: string;
    state: DurableAgentState;
    sessionHealth: DurableSessionHealth;
    createdAt: string;
    updatedAt: string;
    lastActiveAt: string | null;
    lastResult: DurableLastResult | null;
    activeRun: DurableActiveRun | null;
}

export interface ClaudeDurableAgent extends DurableAgentBase {
    provider: 'claude';
    providerSessionId: string;
}

export interface CodexDurableAgent extends DurableAgentBase {
    provider: 'codex';
    providerSessionId: string | null;
}

export interface PiDurableAgent extends DurableAgentBase {
    provider: 'pi';
    providerSessionId: string;
}

export type DurableAgent = ClaudeDurableAgent | CodexDurableAgent | PiDurableAgent;

export class DurableAgentError extends Error {
    constructor(
        message: string,
        public readonly code: string,
    ) {
        super(message);
        this.name = 'DurableAgentError';
    }
}

export class DurableAgentBusyError extends DurableAgentError {
    constructor(
        public readonly agentId: string,
        agentName: string,
    ) {
        super(`Durable agent "${agentName}" is busy.`, 'DURABLE_AGENT_BUSY');
        this.name = 'DurableAgentBusyError';
    }
}

export class DurableAgentNotFoundError extends DurableAgentError {
    constructor(public readonly reference: string) {
        super(`Durable agent "${reference}" was not found.`, 'DURABLE_AGENT_NOT_FOUND');
        this.name = 'DurableAgentNotFoundError';
    }
}

export class DurableAgentRepositoryError extends DurableAgentError {
    constructor(message: string) {
        super(message, 'DURABLE_AGENT_REPOSITORY');
        this.name = 'DurableAgentRepositoryError';
    }
}

export class DurableAgentNameConflictError extends DurableAgentError {
    constructor(public readonly agentName: string) {
        super(`Durable agent name "${agentName}" is already in use.`, 'DURABLE_AGENT_NAME_CONFLICT');
        this.name = 'DurableAgentNameConflictError';
    }
}

export class ClaudePrintError extends DurableAgentError {
    constructor(message: string, code = 'CLAUDE_PRINT_FAILED') {
        super(message, code);
        this.name = 'ClaudePrintError';
    }
}

export type CodexPrintErrorCode =
    | 'CODEX_PROTOCOL'
    | 'CODEX_PROCESS'
    | 'CODEX_SESSION_MISMATCH'
    | 'CODEX_UNSUPPORTED'
    | 'CODEX_RESULT_MISSING'
    | 'CODEX_CLI_UNSUPPORTED'
    | 'CODEX_CLI_UNAVAILABLE';

export class CodexPrintError extends DurableAgentError {
    constructor(message: string, code: CodexPrintErrorCode) {
        super(message, code);
        this.name = 'CodexPrintError';
    }
}

export class PiPrintError extends DurableAgentError {
    constructor(message: string, code: PiPrintErrorCode = 'PI_PROCESS') {
        super(message, code);
        this.name = 'PiPrintError';
    }
}
