import path from "path";
import type { AGENT_TYPES } from "../adapters/AgentAdapter.js";
import { executablePath } from "./process.js";

/** Every built-in harness can be started, so each needs an {@link AGENTS} entry. */
export type StartableAgentType = (typeof AGENT_TYPES)[number];

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
  claude: { command: "claude", matches: matchArgv0("claude") },
  codex: { command: "codex", matches: matchArgv0("codex") },
  copilot: { command: "copilot", matches: matchArgv0Name("copilot-cli") },
  gemini_cli: { command: "gemini", matches: matchAnyToken("gemini") },
  grok_cli: { command: "grok", matches: matchArgv0("grok") },
  antigravity_cli: { command: "agy", matches: matchArgv0("agy") },
  opencode: { command: "opencode", matches: matchArgv0("opencode") },
  pi: { command: "pi", matches: matchAnyBasename(["pi"]) },
  kiro: { command: "kiro-cli", matches: matchAnyBasename(["kiro-cli", "kiro"]) },
};

/**
 * Matchers read a `ps` command line, where argv is joined with spaces. argv[0]
 * is resolved with {@link executablePath} so executables installed under
 * directories containing spaces are recognised, while arguments are never
 * folded into the executable path unless that combined path is a real file.
 *
 * The filesystem is consulted only when a token after the first could be part
 * of a matching argv[0]; commands whose first token already decides the match,
 * or that contain no candidate token at all, are handled with string checks.
 */
const ABSOLUTE_PATH = /^(?:\/|[a-zA-Z]:[\\/])/;
const PATH_SEPARATOR = /[\\/]/;

function basenameOf(token: string): string {
  return path.basename(token).toLowerCase();
}

function tokensOf(psCommand: string): string[] {
  return psCommand.trim().split(/\s+/).filter(Boolean);
}

/** Split a command line into its resolved argv[0] and the remaining argument tokens. */
function splitArgv0(psCommand: string): { argv0: string; args: string[] } {
  const command = psCommand.trim();
  const argv0 = executablePath(command);
  return { argv0, args: tokensOf(command.slice(argv0.length)) };
}

/** Whether argv[0] may span several tokens, i.e. a later path-like token satisfies `test`. */
function mayContinueArgv0(tokens: string[], test: (token: string) => boolean): boolean {
  return (
    ABSOLUTE_PATH.test(tokens[0]) &&
    tokens.slice(1).some((token) => PATH_SEPARATOR.test(token) && test(token))
  );
}

function matchArgv0(name: string): (psCommand: string) => boolean {
  const lower = name.toLowerCase();
  const test = (token: string) => basenameOf(token) === lower;
  return (psCommand) => {
    const tokens = tokensOf(psCommand);
    if (tokens.length === 0) return false;
    if (test(tokens[0])) return true;
    return mayContinueArgv0(tokens, test) && test(executablePath(psCommand));
  };
}

function matchArgv0Name(name: string): (psCommand: string) => boolean {
  const lower = name.toLowerCase();
  const test = (token: string) => token.toLowerCase().includes(lower);
  return (psCommand) => {
    const tokens = tokensOf(psCommand);
    if (tokens.length === 0) return false;
    if (test(tokens[0])) return true;
    return mayContinueArgv0(tokens, test) && test(executablePath(psCommand));
  };
}

function matchAnyToken(name: string): (psCommand: string) => boolean {
  return matchAnyBasename([name]);
}

function matchAnyBasename(names: string[]): (psCommand: string) => boolean {
  const lowers = new Set(names.map((name) => name.toLowerCase()));
  const test = (token: string) => lowers.has(basenameOf(token));
  return (psCommand) => {
    const tokens = tokensOf(psCommand);
    if (tokens.length === 0) return false;
    if (test(tokens[0])) return true;
    if (!tokens.slice(1).some(test)) return false;
    if (!ABSOLUTE_PATH.test(tokens[0])) return true;

    const { argv0, args } = splitArgv0(psCommand);
    return test(argv0) || args.some(test);
  };
}
