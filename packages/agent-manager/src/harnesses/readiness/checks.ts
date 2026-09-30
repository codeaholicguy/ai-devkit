import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access as fsAccess, readFile as fsReadFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { getCodexCapacityReport } from "../../capacity/index.js";
import { HARNESS_RUNTIME_PROFILES } from "../runtimeProfiles.js";
import type {
  AgentReadinessOptions,
  BuiltInSkillsReadinessCheck,
  DirectoryReadinessCheck,
  ExecutableReadinessCheck,
  ReadinessAgentType,
  ReadinessCheck,
  ReadinessRuntime,
  ReadinessStatus,
} from "./types.js";

const execFileAsync = promisify(execFile);

export function createReadinessRuntime(options: AgentReadinessOptions): ReadinessRuntime {
  return {
    homeDir: options.homeDir ?? process.env.HOME ?? "",
    path: options.path ?? process.env.PATH ?? "",
    assetRoot: options.assetRoot ?? null,
    builtInSkillNames: options.builtInSkillNames ?? [],
    skillRoots: options.skillRoots ?? {},
    readFile: options.readFile ?? ((target) => fsReadFile(target, "utf8")),
    access: options.access ?? ((target, mode = constants.R_OK) => fsAccess(target, mode)),
    runCommand: options.runCommand ?? defaultRunCommand,
    codexAuth: options.codexAuth ?? (async () => (await getCodexCapacityReport()).authenticated),
  };
}

async function defaultRunCommand(command: string, args: string[]) {
  const result = await execFileAsync(command, args, {
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

function statusRank(status: ReadinessStatus): number {
  return status === "fail" ? 2 : status === "warn" ? 1 : 0;
}

export function worstReadinessStatus(statuses: ReadinessStatus[]): ReadinessStatus {
  return statuses.reduce<ReadinessStatus>(
    (worst, current) => (statusRank(current) > statusRank(worst) ? current : worst),
    "pass",
  );
}

export function displayHome(target: string, homeDir: string): string {
  return target === homeDir
    ? "~"
    : target.startsWith(`${homeDir}/`)
      ? `~${target.slice(homeDir.length)}`
      : target;
}

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function accessible(
  target: string,
  runtime: ReadinessRuntime,
  mode = constants.R_OK,
): Promise<boolean> {
  try {
    await runtime.access(target, mode);
    return true;
  } catch {
    return false;
  }
}

async function resolveExecutable(
  command: string,
  runtime: ReadinessRuntime,
): Promise<string | null> {
  const candidates = runtime.path
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, command));
  const checks = await Promise.all(
    candidates.map(async (target) => ({
      target,
      available: await accessible(target, runtime, constants.X_OK),
    })),
  );
  return checks.find((check) => check.available)?.target ?? null;
}

export async function executableCheck(
  agent: ReadinessAgentType,
  runtime: ReadinessRuntime,
): Promise<ExecutableReadinessCheck> {
  const command = HARNESS_RUNTIME_PROFILES[agent].command;
  const resolvedPath = await resolveExecutable(command, runtime);
  return {
    command,
    path: resolvedPath,
    status: resolvedPath ? "pass" : "fail",
    errors: resolvedPath ? [] : [`${command} was not found on PATH`],
  };
}

export async function directoryCheck(
  configDir: string,
  runtime: ReadinessRuntime,
): Promise<DirectoryReadinessCheck> {
  const target = join(runtime.homeDir, configDir);
  const readable = await accessible(target, runtime);
  return {
    path: displayHome(target, runtime.homeDir),
    present: readable,
    readable,
    status: readable ? "pass" : "fail",
    errors: readable ? [] : ["global configuration directory is unavailable"],
  };
}

export async function builtInSkillsCheck(
  agent: ReadinessAgentType,
  runtime: ReadinessRuntime,
): Promise<BuiltInSkillsReadinessCheck> {
  const relativeRoot = runtime.skillRoots[agent];
  if (!relativeRoot) {
    return {
      path: null,
      required: runtime.builtInSkillNames.length,
      present: 0,
      missing: [...runtime.builtInSkillNames],
      status: "info",
      errors: [],
    };
  }
  const root = join(runtime.homeDir, relativeRoot);
  const checks = await Promise.all(
    runtime.builtInSkillNames.map(async (name) => ({
      name,
      present: await accessible(join(root, name, "SKILL.md"), runtime),
    })),
  );
  const present = checks.filter((check) => check.present).map((check) => check.name);
  const missing = runtime.builtInSkillNames.filter((name) => !present.includes(name));
  return {
    path: displayHome(root, runtime.homeDir),
    required: runtime.builtInSkillNames.length,
    present: present.length,
    missing: [...missing],
    status: "info",
    errors: [],
  };
}

export async function scriptCheck(
  installed: string,
  bundled: string,
  runtime: ReadinessRuntime,
): Promise<
  ReadinessCheck & {
    path: string;
    present: boolean;
    readable: boolean;
    matchesBundledAsset: boolean;
  }
> {
  let installedText: string;
  try {
    installedText = await runtime.readFile(installed);
  } catch {
    return {
      path: displayHome(installed, runtime.homeDir),
      present: false,
      readable: false,
      matchesBundledAsset: false,
      status: "fail",
      errors: ["hook script is unavailable"],
    };
  }
  try {
    const bundledText = await runtime.readFile(bundled);
    const matches = installedText === bundledText;
    return {
      path: displayHome(installed, runtime.homeDir),
      present: true,
      readable: true,
      matchesBundledAsset: matches,
      status: matches ? "pass" : "fail",
      errors: matches ? [] : ["hook script differs from the bundled AI DevKit asset"],
    };
  } catch {
    return {
      path: displayHome(installed, runtime.homeDir),
      present: true,
      readable: true,
      matchesBundledAsset: false,
      status: "fail",
      errors: ["bundled hook asset is unavailable"],
    };
  }
}

function containsHook(root: unknown, event: string, command: string): boolean {
  const hooks = record(record(root)?.hooks);
  const entries = hooks?.[event];
  if (!Array.isArray(entries)) return false;
  return entries.some((entry) => {
    const commands = record(entry)?.hooks;
    return (
      Array.isArray(commands) &&
      commands.some((hook) => {
        const item = record(hook);
        return item?.type === "command" && item.command === command;
      })
    );
  });
}

export async function registrationCheck(
  target: string,
  event: string,
  command: string,
  runtime: ReadinessRuntime,
): Promise<
  ReadinessCheck & {
    path: string;
    event: string;
    command: string;
    present: boolean;
    valid: boolean;
  }
> {
  try {
    const parsed = JSON.parse(await runtime.readFile(target));
    const valid = containsHook(parsed, event, command);
    return {
      path: displayHome(target, runtime.homeDir),
      event,
      command,
      present: true,
      valid,
      status: valid ? "pass" : "fail",
      errors: valid ? [] : ["required hook registration is missing"],
    };
  } catch {
    return {
      path: displayHome(target, runtime.homeDir),
      event,
      command,
      present: false,
      valid: false,
      status: "fail",
      errors: ["hook configuration is missing or invalid"],
    };
  }
}

export async function mappingCheck(
  target: string,
  runtime: ReadinessRuntime,
): Promise<
  ReadinessCheck & {
    path: string;
    present: boolean;
    valid: boolean;
    invalidEntries: number;
    staleEntries: number;
  }
> {
  let text: string;
  try {
    text = await runtime.readFile(target);
  } catch {
    return {
      path: displayHome(target, runtime.homeDir),
      present: false,
      valid: false,
      invalidEntries: 0,
      staleEntries: 0,
      status: "warn",
      errors: ["session mapping has not been created"],
    };
  }
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = record(JSON.parse(text));
  } catch {
    // Fixed safe error below.
  }
  if (!parsed) {
    return {
      path: displayHome(target, runtime.homeDir),
      present: true,
      valid: false,
      invalidEntries: 0,
      staleEntries: 0,
      status: "fail",
      errors: ["session mapping is invalid"],
    };
  }
  const entries = await Promise.all(
    Object.entries(parsed).map(async ([pid, sessionPath]) => {
      if (!/^\d+$/.test(pid) || typeof sessionPath !== "string" || !sessionPath) {
        return { valid: false, stale: false };
      }
      return { valid: true, stale: !(await accessible(sessionPath, runtime)) };
    }),
  );
  const invalidEntries = entries.filter((entry) => !entry.valid).length;
  const staleEntries = entries.filter((entry) => entry.stale).length;
  const valid = invalidEntries === 0;
  return {
    path: displayHome(target, runtime.homeDir),
    present: true,
    valid,
    invalidEntries,
    staleEntries,
    status: !valid ? "fail" : staleEntries ? "warn" : "pass",
    errors: !valid
      ? ["session mapping contains invalid entries"]
      : staleEntries
        ? ["session mapping contains stale entries"]
        : [],
  };
}
