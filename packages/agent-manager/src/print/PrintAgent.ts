export type PrintAgentState = 'ready' | 'running' | 'degraded';
export type PrintSessionHealth = 'uninitialized' | 'healthy' | 'unknown' | 'mismatch';
export type PrintRunStatus = 'succeeded' | 'failed' | 'interrupted';

export interface ProcessIdentity {
    pid: number;
    startedAt: string;
}

export interface PrintActiveRun {
    token: string;
    owner: ProcessIdentity;
    provider: ProcessIdentity | null;
    startedAt: string;
}

export interface PrintLastResult {
    status: PrintRunStatus;
    completedAt: string;
    exitCode: number | null;
    summary: string;
}

export interface PrintAgent {
    id: string;
    name: string;
    provider: 'claude';
    mode: 'print';
    cwd: string;
    providerSessionId: string;
    state: PrintAgentState;
    sessionHealth: PrintSessionHealth;
    createdAt: string;
    updatedAt: string;
    lastActiveAt: string | null;
    lastResult: PrintLastResult | null;
    activeRun: PrintActiveRun | null;
}

export class PrintAgentError extends Error {
    constructor(
        message: string,
        public readonly code: string,
    ) {
        super(message);
        this.name = 'PrintAgentError';
    }
}

export class PrintAgentBusyError extends PrintAgentError {
    constructor(
        public readonly agentId: string,
        agentName: string,
    ) {
        super(`Print agent "${agentName}" is busy.`, 'PRINT_AGENT_BUSY');
        this.name = 'PrintAgentBusyError';
    }
}

export class PrintAgentNotFoundError extends PrintAgentError {
    constructor(public readonly reference: string) {
        super(`Print agent "${reference}" was not found.`, 'PRINT_AGENT_NOT_FOUND');
        this.name = 'PrintAgentNotFoundError';
    }
}

export class PrintAgentStoreError extends PrintAgentError {
    constructor(message: string) {
        super(message, 'PRINT_AGENT_STORE');
        this.name = 'PrintAgentStoreError';
    }
}

export class PrintAgentNameConflictError extends PrintAgentError {
    constructor(public readonly agentName: string) {
        super(`Print agent name "${agentName}" is already in use.`, 'PRINT_AGENT_NAME_CONFLICT');
        this.name = 'PrintAgentNameConflictError';
    }
}

export class ClaudePrintError extends PrintAgentError {
    constructor(message: string, code = 'CLAUDE_PRINT_FAILED') {
        super(message, code);
        this.name = 'ClaudePrintError';
    }
}
