import type {
    AgentType,
    ListSessionsOptions,
    SessionSummary,
} from '@ai-devkit/agent-manager';
import { truncate } from './text.js';

const FIRST_MESSAGE_MAX_WIDTH = 80;
const FIRST_MESSAGE_PLACEHOLDER = '(no message yet)';
const VALID_AGENT_TYPES: AgentType[] = ['claude', 'codex', 'gemini_cli', 'grok_cli', 'opencode', 'copilot', 'pi'];

export interface ResolvedListSessionsOptions {
    adapterOptions: ListSessionsOptions;
    /** True when the cwd filter fell back to process.cwd() (no --all/--cwd given). */
    usedDefaultCwd: boolean;
}

/**
 * Translate the raw `agent sessions` flags into the options object passed
 * to `AgentManager.listSessions`. CLI is the source of truth for filter
 * defaults — adapters apply what they receive.
 */
export function resolveListSessionsOptions(options: {
    all?: boolean;
    cwd?: string;
    type?: string;
}): ResolvedListSessionsOptions {
    let cwd: string | undefined;
    let usedDefaultCwd = false;
    if (options.all) {
        cwd = undefined;
    } else if (typeof options.cwd === 'string' && options.cwd.length > 0) {
        cwd = options.cwd;
    } else {
        cwd = process.cwd();
        usedDefaultCwd = true;
    }

    let type: AgentType | undefined;
    if (typeof options.type === 'string' && options.type.length > 0) {
        if (!VALID_AGENT_TYPES.includes(options.type as AgentType)) {
            throw new Error(
                `Invalid --type "${options.type}". Expected one of: ${VALID_AGENT_TYPES.join(', ')}.`,
            );
        }
        type = options.type as AgentType;
    }

    return { adapterOptions: { cwd, type }, usedDefaultCwd };
}

/**
 * Parse the `--limit <n>` flag. Returns:
 *   - `50` when the flag is omitted (default).
 *   - `undefined` when the flag is `0` (meaning "no cap").
 *   - The parsed integer otherwise.
 * Throws on negative or non-numeric input.
 */
export function parseLimit(raw: string | number | undefined): number | undefined {
    if (raw === undefined) return 50;
    const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
    if (Number.isNaN(n) || n < 0) {
        throw new Error(`--limit must be a non-negative integer (got "${raw}")`);
    }
    return n === 0 ? undefined : n;
}

/**
 * Render the `firstUserMessage` field for the table column:
 *   - Empty string → "(no message yet)" placeholder.
 *   - Long strings truncated to 80 chars with an ellipsis.
 * JSON output keeps the raw string; this is render-only.
 */
export function formatFirstMessage(text: string): string {
    const display = text.length > 0 ? text : FIRST_MESSAGE_PLACEHOLDER;
    return truncate(display, FIRST_MESSAGE_MAX_WIDTH, '…');
}

/**
 * Convert a {@link SessionSummary} into the JSON-serializable shape
 * exposed by `agent sessions --json`. Dates become ISO strings; every
 * other field is passed through unchanged.
 */
export function toJsonSession(session: SessionSummary): Record<string, unknown> {
    return {
        type: session.type,
        sessionId: session.sessionId,
        cwd: session.cwd,
        firstUserMessage: session.firstUserMessage,
        lastActive: session.lastActive.toISOString(),
        startedAt: session.startedAt.toISOString(),
        sessionFilePath: session.sessionFilePath,
    };
}
