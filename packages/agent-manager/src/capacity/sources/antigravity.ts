import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access as fsAccess,
  chmod,
  mkdtemp,
  rm,
  stat as fsStat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  AntigravityCliError,
  classifyAntigravityExitFailure,
  fetchAntigravityRemoteCapacity,
  isSupportedAntigravityVersion,
  parseAntigravityUsageReport,
  parseAntigravityVersion,
  type AntigravityVersion,
} from "../providers/antigravity.js";
import {
  resolveAntigravityOAuthCredential,
  type AntigravityCredentialOptions,
} from "../../harnesses/antigravity/credentials.js";
import type { CapacityReport } from "../types.js";

const DEFAULT_USAGE_TIMEOUT_MS = 90_000;
const DEFAULT_VERSION_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const VERSION_MAX_OUTPUT_BYTES = 64 * 1024;
const KILL_GRACE_MS = 200;
const FAILING_LAUNCHER_SCRIPT = "#!/bin/sh\nexit 1\n";

export type AntigravityBinaryStat = {
  size: number;
  mtimeMs: number;
  ino: number;
};

export type AntigravityExecResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  outputTooLarge?: boolean;
};

export type AntigravityExecOptions = {
  command: string;
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  maxOutputBytes: number;
};

export type AntigravityCapacityOptions = AntigravityCredentialOptions & {
  path?: string;
  access?: (target: string) => Promise<void>;
  stat?: (target: string) => Promise<AntigravityBinaryStat>;
  exec?: (options: AntigravityExecOptions) => Promise<AntigravityExecResult>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  versionTimeoutMs?: number;
  remoteTimeoutMs?: number;
  maxOutputBytes?: number;
};

export type AntigravityProbeOptions = AntigravityCapacityOptions & {
  checkedAt: string;
};

type CachedVersion = {
  binaryPath: string;
  size: number;
  mtimeMs: number;
  ino: number;
  version: AntigravityVersion;
};

let versionCache: CachedVersion | null = null;

export function resetAntigravityVersionCache(): void {
  versionCache = null;
}

async function isExecutable(
  target: string,
  checkAccess?: (target: string) => Promise<void>,
): Promise<boolean> {
  try {
    if (checkAccess) {
      await checkAccess(target);
    } else {
      await fsAccess(target, constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

async function resolveAntigravityBinary(options: AntigravityProbeOptions): Promise<string> {
  const env = options.env ?? process.env;
  if (Object.hasOwn(env, "ANTIGRAVITY_CLI_PATH") && env.ANTIGRAVITY_CLI_PATH !== undefined) {
    const override = env.ANTIGRAVITY_CLI_PATH.trim();
    if (!override || !(await isExecutable(override, options.access))) {
      throw new AntigravityCliError("executable_not_found", "agy executable not found");
    }
    return override;
  }

  const pathValue = options.path ?? env.PATH ?? "";
  const home = env.HOME ?? os.homedir();
  const candidates = [
    ...pathValue
      .split(path.delimiter)
      .filter(Boolean)
      .map((dir) => path.join(dir, "agy")),
    path.join(home, ".local", "bin", "agy"),
    "/opt/homebrew/bin/agy",
    "/usr/local/bin/agy",
  ];

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (await isExecutable(candidate, options.access)) return candidate;
  }

  throw new AntigravityCliError("executable_not_found", "agy executable not found");
}

function signalProcessTree(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid) return;
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, signal);
      return;
    } catch {
      // Fall back to signaling the direct child PID.
    }
  }
  try {
    process.kill(pid, signal);
  } catch {
    // Process already exited.
  }
}

function defaultExec(options: AntigravityExecOptions): Promise<AntigravityExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, [...options.args], {
      cwd: options.cwd,
      env: options.env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputTooLarge = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | null = null;

    const terminate = () => {
      signalProcessTree(child.pid, "SIGTERM");
      if (!killTimer) {
        killTimer = setTimeout(() => {
          signalProcessTree(child.pid, "SIGKILL");
        }, KILL_GRACE_MS);
        killTimer.unref();
      }
    };

    const finish = (error?: Error, exitCode: number | null = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      signalProcessTree(child.pid, "SIGTERM");
      if (error) {
        reject(error);
      } else {
        resolve({
          exitCode,
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
          timedOut,
          outputTooLarge,
        });
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, options.timeoutMs);
    timer.unref();

    child.stdout.on("data", (chunk: Buffer) => {
      if (outputTooLarge) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > options.maxOutputBytes) {
        outputTooLarge = true;
        terminate();
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (outputTooLarge) return;
      stderrBytes += chunk.length;
      if (stderrBytes > options.maxOutputBytes) {
        outputTooLarge = true;
        terminate();
        return;
      }
      stderrChunks.push(chunk);
    });

    child.once("error", () => {
      finish(new AntigravityCliError("launch_failed", "agy failed to launch"));
    });

    child.once("close", (code) => {
      finish(undefined, code);
    });
  });
}

async function readBinaryStat(
  binaryPath: string,
  statFn?: (target: string) => Promise<AntigravityBinaryStat>,
): Promise<AntigravityBinaryStat | null> {
  try {
    const info = statFn ? await statFn(binaryPath) : await fsStat(binaryPath);
    return { size: info.size, mtimeMs: info.mtimeMs, ino: info.ino };
  } catch {
    return null;
  }
}

async function resolveAntigravityVersion(
  binaryPath: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: AntigravityProbeOptions,
): Promise<AntigravityVersion | null> {
  const binaryStat = await readBinaryStat(binaryPath, options.stat);
  if (
    binaryStat &&
    versionCache &&
    versionCache.binaryPath === binaryPath &&
    versionCache.size === binaryStat.size &&
    versionCache.mtimeMs === binaryStat.mtimeMs &&
    versionCache.ino === binaryStat.ino
  ) {
    return versionCache.version;
  }

  const exec = options.exec ?? defaultExec;
  const result = await exec({
    command: binaryPath,
    args: ["--version"],
    cwd,
    env,
    timeoutMs: options.versionTimeoutMs ?? DEFAULT_VERSION_TIMEOUT_MS,
    maxOutputBytes: VERSION_MAX_OUTPUT_BYTES,
  });

  if (result.timedOut || result.outputTooLarge || result.exitCode !== 0) {
    return null;
  }

  const parsed = parseAntigravityVersion(`${result.stdout}\n${result.stderr}`);
  if (parsed && binaryStat) {
    versionCache = {
      binaryPath,
      size: binaryStat.size,
      mtimeMs: binaryStat.mtimeMs,
      ino: binaryStat.ino,
      version: parsed,
    };
  }
  return parsed;
}

async function createProbeSandbox(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-devkit-agy-"));
  await chmod(dir, 0o700);
  for (const stubName of ["open", "xdg-open"]) {
    const stubPath = path.join(dir, stubName);
    await writeFile(stubPath, FAILING_LAUNCHER_SCRIPT, { encoding: "utf8", mode: 0o700 });
    await chmod(stubPath, 0o700);
  }
  return dir;
}

function buildProbeEnv(baseEnv: NodeJS.ProcessEnv, sandboxDir: string): NodeJS.ProcessEnv {
  const existingPath = baseEnv.PATH ?? "";
  return {
    ...baseEnv,
    AGY_CLI_DISABLE_AUTO_UPDATE: "true",
    PATH: existingPath ? `${sandboxDir}${path.delimiter}${existingPath}` : sandboxDir,
    BROWSER: path.join(sandboxDir, "open"),
  };
}

function antigravityReport(
  snapshot: Omit<CapacityReport, "harness" | "provider" | "generatedAt">,
  checkedAt: string,
): CapacityReport {
  return {
    harness: "antigravity",
    provider: "antigravity",
    generatedAt: checkedAt,
    ...snapshot,
  };
}

export async function probeAntigravityCapacity(
  options: AntigravityProbeOptions,
): Promise<CapacityReport> {
  const oauthCredential = await resolveAntigravityOAuthCredential(options);
  if (oauthCredential) {
    try {
      const snapshot = await fetchAntigravityRemoteCapacity(oauthCredential, {
        fetch: options.fetch,
        timeoutMs: options.remoteTimeoutMs,
      });
      return antigravityReport(snapshot, options.checkedAt);
    } catch {
      // Fall back to the local agy CLI print report if remote OAuth fails.
    }
  }

  const binaryPath = await resolveAntigravityBinary(options);
  const sandboxDir = await createProbeSandbox();

  try {
    const childEnv = buildProbeEnv(options.env ?? process.env, sandboxDir);
    const version = await resolveAntigravityVersion(binaryPath, sandboxDir, childEnv, options);
    if (!version || !isSupportedAntigravityVersion(version)) {
      throw new AntigravityCliError(
        "unsupported_version",
        "agy CLI >= 1.1.11 is required for quota reporting",
      );
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_USAGE_TIMEOUT_MS;
    const printTimeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
    const exec = options.exec ?? defaultExec;
    const result = await exec({
      command: binaryPath,
      args: ["-p", "/usage", "--output-format", "json", "--print-timeout", `${printTimeoutSec}s`],
      cwd: sandboxDir,
      env: childEnv,
      timeoutMs,
      maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    });

    if (result.timedOut) {
      throw new AntigravityCliError("timed_out", "Antigravity CLI quota probe timed out");
    }
    if (result.outputTooLarge) {
      throw new AntigravityCliError(
        "output_too_large",
        "Antigravity CLI usage report exceeded output limit",
      );
    }
    if (result.exitCode !== 0) {
      const classified = classifyAntigravityExitFailure(result.exitCode ?? 1, result.stderr);
      if (classified.kind === "authentication_required") {
        return antigravityReport(
          {
            authenticated: false,
            available: "unknown",
            windows: [],
            creditsRemaining: null,
          },
          options.checkedAt,
        );
      }
      throw classified;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(result.stdout);
    } catch {
      throw new Error("Antigravity CLI usage report is not valid JSON");
    }

    const snapshot = parseAntigravityUsageReport(parsedJson);
    return antigravityReport(snapshot, options.checkedAt);
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
}
