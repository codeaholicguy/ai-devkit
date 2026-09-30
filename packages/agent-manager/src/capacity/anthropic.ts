import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { probeAnthropicOAuthCapacity } from "./claude.js";
import type { CapacityReport } from "./types.js";

type UnknownRecord = Record<string, unknown>;

export type AnthropicCapacityOptions = {
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export type AnthropicProbeOptions = AnthropicCapacityOptions & {
  checkedAt: string;
};

type PiAnthropicCredential = {
  access: string;
  expired: boolean;
};

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function expiryMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value > 1e12 ? value : value * 1000;
}

async function resolvePiAnthropicCredential(
  options: AnthropicProbeOptions,
): Promise<PiAnthropicCredential> {
  const env = options.env ?? process.env;
  const authPath = join(env.HOME || homedir(), ".pi", "agent", "auth.json");
  let root: UnknownRecord;
  try {
    const contents = await (options.readFile ?? readFile)(authPath, "utf8");
    const parsed = record(JSON.parse(contents));
    if (!parsed) throw new Error("invalid");
    root = parsed;
  } catch (error) {
    if (record(error)?.code === "ENOENT") {
      throw new Error("Pi Anthropic OAuth credentials not found");
    }
    throw new Error("Pi Anthropic auth file is malformed");
  }

  const credential = record(root.anthropic);
  if (!credential) throw new Error("Pi Anthropic OAuth credentials not found");
  const access = credential.type === "oauth" ? nonEmptyText(credential.access) : null;
  if (!access) throw new Error("Pi Anthropic OAuth credential is malformed");
  const expiresAt = expiryMs(credential.expires);
  const now = options.now?.() ?? new Date();
  return { access, expired: expiresAt !== null && expiresAt <= now.getTime() };
}

export async function probeAnthropicCapacity(
  options: AnthropicProbeOptions,
): Promise<CapacityReport> {
  const credential = await resolvePiAnthropicCredential(options);
  if (credential.expired) {
    return {
      harness: "pi",
      provider: "anthropic",
      generatedAt: options.checkedAt,
      authenticated: true,
      available: "unknown",
      windows: [],
      creditsRemaining: null,
    };
  }
  return probeAnthropicOAuthCapacity(credential.access, "pi", options);
}
