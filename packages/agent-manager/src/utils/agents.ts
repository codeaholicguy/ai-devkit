import path from 'path';
import type { AgentType } from '../adapters/AgentAdapter.js';

export type StartableAgentType = Extract<AgentType, 'claude' | 'codex' | 'copilot' | 'gemini_cli' | 'grok_cli' | 'opencode' | 'pi'>;

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
    copilot:    { command: 'copilot',  matches: matchArgv0Name('copilot-cli') },
    gemini_cli: { command: 'gemini',   matches: matchAnyToken('gemini') },
    grok_cli:   { command: 'grok',     matches: matchArgv0('grok') },
    opencode:   { command: 'opencode', matches: matchArgv0('opencode') },
    pi:         { command: 'pi',       matches: matchAnyBasename(['pi']) },
};

function matchArgv0(name: string): (psCommand: string) => boolean {
    const lower = name.toLowerCase();
    return (psCommand) => {
        const token = psCommand.trim().split(/\s+/)[0];
        return token ? path.basename(token).toLowerCase() === lower : false;
    };
}

function matchArgv0Name(name: string): (psCommand: string) => boolean {
    const lower = name.toLowerCase();
    return (psCommand) => {
        const token = psCommand.trim().split(/\s+/)[0];
        return token ? token.toLowerCase().includes(lower) : false;
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

function matchAnyBasename(names: string[]): (psCommand: string) => boolean {
    const lowers = new Set(names.map((name) => name.toLowerCase()));
    return (psCommand) => {
        for (const token of psCommand.trim().split(/\s+/)) {
            if (lowers.has(path.basename(token).toLowerCase())) return true;
        }
        return false;
    };
}
