export type DurableAgentState = 'ready' | 'running' | 'degraded';
export type DurableSessionHealth = 'uninitialized' | 'healthy' | 'unknown' | 'mismatch';
export type DurableRunStatus = 'succeeded' | 'failed' | 'interrupted';

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

export interface DurableAgent {
    id: string;
    name: string;
    provider: 'claude';
    mode: typeof AGENT_MODES.DURABLE;
    cwd: string;
    providerSessionId: string;
    state: DurableAgentState;
    sessionHealth: DurableSessionHealth;
    createdAt: string;
    updatedAt: string;
    lastActiveAt: string | null;
    lastResult: DurableLastResult | null;
    activeRun: DurableActiveRun | null;
}

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
