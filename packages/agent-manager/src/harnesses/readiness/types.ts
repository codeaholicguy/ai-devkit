import { AGENT_TYPES } from "../../adapters/AgentAdapter.js";

export const READINESS_AGENT_TYPES = AGENT_TYPES;

export type ReadinessStatus = "pass" | "warn" | "fail";
export type ReadinessAuthState = "authenticated" | "unauthenticated" | "unknown";
export type ReadinessAgentType = (typeof READINESS_AGENT_TYPES)[number];
type ReadinessInfoStatus = ReadinessStatus | "info";

export type CommandResult = { stdout: string; stderr: string };
export type ReadFile = (target: string) => Promise<string>;
export type Access = (target: string, mode?: number) => Promise<void>;
export type RunCommand = (command: string, args: string[]) => Promise<CommandResult>;

export interface ReadinessCheck<S extends ReadinessInfoStatus = ReadinessStatus> {
  status: S;
  errors: string[];
}

export interface ExecutableReadinessCheck extends ReadinessCheck {
  command: string;
  path: string | null;
}

export interface DirectoryReadinessCheck extends ReadinessCheck {
  path: string;
  present: boolean;
  readable: boolean;
}

export interface BuiltInSkillsReadinessCheck extends ReadinessCheck<"info"> {
  path: string | null;
  required: number;
  present: number;
  missing: string[];
}

export interface AuthReadinessCheck extends ReadinessCheck {
  state: ReadinessAuthState;
  source: string;
  provider: string | null;
  availableProviders: string[];
}

export interface IntegrationReadinessCheck extends ReadinessCheck {
  label: string;
  installed: boolean;
  details?: Record<string, unknown>;
}

export interface AgentReadinessReport {
  type: ReadinessAgentType;
  executable: ExecutableReadinessCheck;
  globalConfig: DirectoryReadinessCheck;
  builtInSkills: BuiltInSkillsReadinessCheck;
  auth?: AuthReadinessCheck;
  integration?: IntegrationReadinessCheck;
  status: ReadinessStatus;
}

export interface AgentReadinessOptions {
  homeDir?: string;
  path?: string;
  assetRoot?: string;
  builtInSkillNames?: readonly string[];
  skillRoots?: Partial<Record<ReadinessAgentType, string>>;
  readFile?: ReadFile;
  access?: Access;
  runCommand?: RunCommand;
  codexAuth?: () => Promise<boolean | null>;
}

export type ReadinessRuntime = Required<
  Omit<AgentReadinessOptions, "assetRoot" | "builtInSkillNames" | "skillRoots">
> & {
  assetRoot: string | null;
  builtInSkillNames: readonly string[];
  skillRoots: Partial<Record<ReadinessAgentType, string>>;
};

export type AuthReadinessProbe = (runtime: ReadinessRuntime) => Promise<AuthReadinessCheck>;
export type IntegrationReadinessProbe = (
  runtime: ReadinessRuntime,
) => Promise<IntegrationReadinessCheck>;

export interface HarnessReadinessProfile {
  configDir: string;
  auth?: AuthReadinessProbe;
  integration?: IntegrationReadinessProbe;
}
