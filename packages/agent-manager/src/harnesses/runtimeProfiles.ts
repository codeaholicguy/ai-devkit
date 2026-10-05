import path from "node:path";
import { AGENT_TYPES, type AgentType } from "../adapters/AgentAdapter.js";
import { executablePath } from "../utils/process.js";

export type StartableAgentType = (typeof AGENT_TYPES)[number];

export interface HarnessRuntimeProfile {
  command: string;
  runtimeKind: string;
  discoveryAliases: readonly string[];
  matches: (psCommand: string) => boolean;
}

export const HARNESS_RUNTIME_PROFILES: Record<StartableAgentType, HarnessRuntimeProfile> = {
  claude: profile("claude", matchArgv0("claude")),
  codex: profile("codex", matchArgv0("codex")),
  copilot: profile("copilot", matchArgv0Name("copilot-cli")),
  gemini_cli: profile("gemini", matchAnyBasename(["gemini"]), ["gemini_cli"]),
  grok_cli: profile("grok", matchArgv0("grok"), ["grok_cli"]),
  antigravity_cli: profile("agy", matchArgv0("agy"), ["antigravity", "antigravity_cli"]),
  opencode: profile("opencode", matchArgv0("opencode")),
  pi: profile("pi", matchAnyBasename(["pi"])),
  kiro: profile("kiro", matchAnyBasename(["kiro-cli", "kiro"]), ["kiro_cli", "kiro-cli"]),
  devin: profile("devin", matchArgv0("devin")),
};

export function runtimeAgentMatchesHarness(runtimeAgent: string, type: AgentType): boolean {
  if (type === "other") return runtimeAgent.toLowerCase() === "other";
  return HARNESS_RUNTIME_PROFILES[type].discoveryAliases.includes(runtimeAgent.toLowerCase());
}

function profile(
  runtimeKind: string,
  matches: (psCommand: string) => boolean,
  extraAliases: readonly string[] = [],
): HarnessRuntimeProfile {
  return {
    command: runtimeKind === "kiro" ? "kiro-cli" : runtimeKind,
    runtimeKind,
    discoveryAliases: [runtimeKind, ...extraAliases],
    matches,
  };
}

const ABSOLUTE_PATH = /^(?:\/|[a-zA-Z]:[\\/])/;
const PATH_SEPARATOR = /[\\/]/;

function basenameOf(token: string): string {
  return path.basename(token).toLowerCase();
}

function tokensOf(psCommand: string): string[] {
  return psCommand.trim().split(/\s+/).filter(Boolean);
}

function splitArgv0(psCommand: string): { argv0: string; args: string[] } {
  const command = psCommand.trim();
  const argv0 = executablePath(command);
  return { argv0, args: tokensOf(command.slice(argv0.length)) };
}

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
