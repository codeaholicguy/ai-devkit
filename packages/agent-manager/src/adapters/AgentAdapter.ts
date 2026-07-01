/**
 * Agent Adapter Interface
 * 
 * Defines the contract for detecting and managing different types of AI agents.
 * Each adapter is responsible for detecting agents of a specific type (e.g., claude).
 */

/**
 * Type of AI agent
 */
export type AgentType = 'claude' | 'gemini_cli' | 'grok_cli' | 'codex' | 'opencode' | 'copilot' | 'pi' | 'other';

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

    /** Timestamp of last activity */
    lastActive: Date;

    /** Path to the session JSONL file on disk */
    sessionFilePath?: string;
}

/**
 * Information about a running process
 */
export interface ProcessInfo {
    /** Process ID */
    pid: number;

    /** Parent process ID, populated by listAgentProcesses when available */
    ppid?: number;

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
 * A single message in a conversation
 */
export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
}

/**
 * A historical session discovered on disk (running or not).
 *
 * Used by `listSessions` to surface enough context for a user to identify
 * a session and resume it via the originating tool's resume command.
 */
export interface SessionSummary {
    /** Tool that produced this session */
    type: AgentType;

    /**
     * ID accepted by the tool's resume command. Adapters MUST pass this
     * through verbatim — no normalization, no encoding/decoding — so it
     * round-trips into `claude --resume <id>` (and equivalents).
     */
    sessionId: string;

    /** Working directory the session was started in (best-known value) */
    cwd: string;

    /**
     * Trimmed first user message; empty string if none. Adapters apply
     * the same noise-filter their existing parsers use (skip tool_result
     * blocks, request-interruption notices, system-injected skill
     * content). The CLI table renderer substitutes a placeholder for
     * empty values; JSON output keeps the empty string raw.
     */
    firstUserMessage: string;

    /** Last activity timestamp (from session content; falls back to file mtime) */
    lastActive: Date;

    /** Session start time (from session content; falls back to file birthtime/mtime) */
    startedAt: Date;

    /** Absolute path to the session file on disk (debug/diagnostics) */
    sessionFilePath: string;
}

/**
 * Filters passed by the CLI to {@link AgentAdapter.listSessions}.
 *
 * The CLI is the source of truth for filter defaults and semantics
 * (e.g. cwd defaults to process.cwd(); --all clears it). Adapters apply
 * the values they receive — they don't invent defaults.
 */
export interface ListSessionsOptions {
    /**
     * Filter to sessions whose recorded cwd matches this path using strict
     * equality (no prefix/ancestor matching in v1). Undefined = no cwd
     * filter.
     */
    cwd?: string;

    /**
     * Filter to a single tool. Enforced by `AgentManager.listSessions`,
     * which skips adapters whose `type` doesn't match. Adapters MAY
     * ignore this field — by the time their `listSessions` runs, the
     * type filter is already satisfied. Undefined = include every
     * registered adapter.
     */
    type?: AgentType;
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

    /**
     * Read the full conversation from a session file
     * @param sessionFilePath Path to the session JSONL file
     * @param options.verbose Include tool call/result details
     * @returns Array of conversation messages
     */
    getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[];

    /**
     * Enumerate historical sessions for this tool from disk.
     *
     * Applies `opts.cwd` as a strict-equality filter when set. Returns
     * {@link SessionSummary} entries unsorted; sorting and global filters
     * are handled by `AgentManager` and the CLI.
     *
     * @param opts Filter options computed by the CLI
     * @returns Array of sessions discovered on disk
     */
    listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]>;
}
