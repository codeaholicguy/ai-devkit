import path from 'path';
import type { AgentType } from '../adapters/AgentAdapter.js';

export type StartableAgentType = Exclude<AgentType, 'other'>;

export interface AgentConfig {
    /** Shell command to launch the agent (sent to tmux via `send-keys`). */
    command: string;
    /** Returns true if the given `ps` command line belongs to this agent. */
    matches: (psCommand: string) => boolean;
}

/**
 * Per-agent configuration: launch command plus a matcher that recognizes the
 * agent's process in `ps` output. Each matcher knows that agent's distribution
 * quirks (e.g. gemini ships as a Node script so its real binary is in argv[1..]).
 */
export const AGENTS: Record<StartableAgentType, AgentConfig> = {
    claude:     { command: 'claude',   matches: matchArgv0('claude') },
    codex:      { command: 'codex',    matches: matchArgv0('codex') },
    opencode:   { command: 'opencode', matches: matchArgv0('opencode') },
    gemini_cli: { command: 'gemini',   matches: matchAnyToken('gemini') },
};

function matchArgv0(name: string): (psCommand: string) => boolean {
    const lower = name.toLowerCase();
    return (psCommand) => {
        const token = psCommand.trim().split(/\s+/)[0];
        return token ? path.basename(token).toLowerCase() === lower : false;
    };
}

function matchAnyToken(name: string): (psCommand: string) => boolean {
    const lower = name.toLowerCase();
    return (psCommand) => {
        for (const token of psCommand.trim().split(/\s+/)) {
            if (path.basename(token).toLowerCase() === lower) return true;
        }
        return false;
    };
}
