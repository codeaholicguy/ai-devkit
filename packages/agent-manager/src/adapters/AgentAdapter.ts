/**
 * Agent Adapter Interface
 * 
 * Defines the contract for detecting and managing different types of AI agents.
 * Each adapter is responsible for detecting agents of a specific type (e.g., claude).
 */

/**
 * Type of AI agent
 */
export type AgentType = 'claude' | 'gemini_cli' | 'codex' | 'other';

/**
 * Current status of an agent
 */
export enum AgentStatus {
    RUNNING = 'running',
    WAITING = 'waiting',
    IDLE = 'idle',
    UNKNOWN = 'unknown'
}

/**
 * Information about a detected agent
 */
export interface AgentInfo {
    /** Project-based name (e.g., "ai-devkit" or "ai-devkit (merry)") */
    name: string;

    /** Type of agent */
    type: AgentType;

    /** Current status */
    status: AgentStatus;

    /** Last user prompt from history */
    summary: string;

    /** Process ID */
    pid: number;

    /** Working directory/project path */
    projectPath: string;

    /** Session UUID */
    sessionId: string;

    /** Human-readable session name (e.g., "merry-wobbling-starlight"), may be undefined for new sessions */
    slug?: string;

    /** Timestamp of last activity */
    lastActive: Date;

}

/**
 * Information about a running process
 */
export interface ProcessInfo {
    /** Process ID */
    pid: number;

    /** Process command */
    command: string;

    /** Working directory */
    cwd: string;

    /** Terminal TTY (e.g., "ttys030") */
    tty: string;

    /** Process start time, populated by enrichProcesses */
    startTime?: Date;
}

/**
 * Agent Adapter Interface
 * 
 * Implementations must provide detection logic for a specific agent type.
 */
export interface AgentAdapter {
    /** Type of agent this adapter handles */
    readonly type: AgentType;

    /**
     * Detect running agents of this type
     * @returns List of detected agents
     */
    detectAgents(): Promise<AgentInfo[]>;

    /**
     * Check if this adapter can handle the given process
     * @param processInfo Process information
     * @returns True if this adapter can handle the process
     */
    canHandle(processInfo: ProcessInfo): boolean;
}
