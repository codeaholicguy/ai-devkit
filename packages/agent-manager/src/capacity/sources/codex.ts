import { spawn } from "node:child_process";
import {
  fetchOpenAiPatAccountId,
  fetchOpenAiSubscriptionCapacity,
  parseWhamUsage,
  resetTime,
  safeIdentifier,
} from "../providers/openai-subscription.js";
import type { CapacityReport, CapacityWindow } from "../types.js";
import {
  resolveCodexCredentials,
  type CodexCredentialOptions,
} from "../../harnesses/codex/credentials.js";

type CodexUsageSource = "pat" | "oauth" | "cli";
type UsageSnapshot = {
  windows: CapacityWindow[];
  creditsRemaining: number | null;
  source: CodexUsageSource;
};

type UnknownRecord = Record<string, unknown>;
type RpcMessage = { id?: number; method: string; params?: UnknownRecord };
type CliResponses = { rateLimits: unknown; account: unknown };
type CodexRpc = (messages: RpcMessage[]) => Promise<CliResponses>;

export type CodexProbeOptions = CodexCredentialOptions & {
  installed: boolean;
  checkedAt: string;
  fetch?: typeof globalThis.fetch;
  rpc?: CodexRpc;
  timeoutMs?: number;
};

export const CODEX_APP_SERVER_ARGS = ["-s", "read-only", "-a", "untrusted", "app-server"] as const;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseUsage(raw: unknown, source: "pat" | "oauth"): UsageSnapshot {
  const { windows, creditsRemaining } = parseWhamUsage(raw);
  return { windows, creditsRemaining, source };
}

function cliWindow(value: unknown, id: string, label: string): CapacityWindow | null {
  const input = record(value);
  if (!input) return null;
  return {
    id,
    label,
    durationMinutes: finiteNumber(input.windowDurationMins),
    usedPercent: finiteNumber(input.usedPercent),
    resetsAt: resetTime(input.resetsAt),
  };
}

function cliSnapshotWindows(value: unknown, fallbackId: string): CapacityWindow[] {
  const snapshot = record(value);
  if (!snapshot) return [];
  const scope = safeIdentifier(snapshot.limitId) ?? safeIdentifier(fallbackId) ?? "codex";
  return [
    cliWindow(snapshot.primary, `${scope}:primary`, `${scope} primary`),
    cliWindow(snapshot.secondary, `${scope}:secondary`, `${scope} secondary`),
  ].filter((item): item is CapacityWindow => item !== null);
}

function parseCliUsage(raw: unknown): UsageSnapshot {
  const response = record(raw) ?? {};
  const primary = record(response.rateLimits);
  const windows = primary ? cliSnapshotWindows(primary, "codex") : [];
  const buckets = record(response.rateLimitsByLimitId);
  if (buckets) {
    for (const [id, snapshot] of Object.entries(buckets)) {
      windows.push(...cliSnapshotWindows(snapshot, id));
    }
  }
  const unique = [...new Map(windows.map((window) => [window.id, window])).values()];
  return { windows: unique, creditsRemaining: null, source: "cli" };
}

function capacityFromSnapshot(
  snapshot: UsageSnapshot,
  options: CodexProbeOptions,
  raw?: unknown,
): CapacityReport {
  const hasUsage = snapshot.windows.some((window) => window.usedPercent !== null);
  const rateLimits = record(record(raw)?.rateLimits);
  const reached = nonEmptyText(rateLimits?.rateLimitReachedType);
  const resetCredits =
    record(record(raw)?.rateLimitResetCredits) ?? record(record(raw)?.usageLimitResetCredits);
  return {
    harness: "codex",
    provider: "openai",
    generatedAt: options.checkedAt,
    authenticated: true,
    available: reached ? "no" : hasUsage ? "yes" : "unknown",
    windows: snapshot.windows,
    creditsRemaining: snapshot.creditsRemaining ?? finiteNumber(resetCredits?.availableCount),
  };
}

function appServerRpc(messages: RpcMessage[], timeoutMs = 5000): Promise<CliResponses> {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", CODEX_APP_SERVER_ARGS, { stdio: ["pipe", "pipe", "ignore"] });
    const results: Partial<CliResponses> = {};
    let buffer = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve(results as CliResponses);
    };
    const timer = setTimeout(() => finish(new Error("codex probe timed out")), timeoutMs);
    child.once("error", () => finish(new Error("codex app-server unavailable")));
    child.once("exit", () => {
      if (!settled) finish(new Error("codex app-server exited"));
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) break;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let message: UnknownRecord;
        try {
          message = JSON.parse(line) as UnknownRecord;
        } catch {
          continue;
        }
        if (message.id === 1) {
          for (const request of messages.slice(1))
            child.stdin.write(`${JSON.stringify(request)}\n`);
        } else if (message.id === 2) {
          if (message.error) finish(new Error("codex rate-limit method failed"));
          else results.rateLimits = message.result;
        } else if (message.id === 3) {
          if (message.error) finish(new Error("codex account method failed"));
          else results.account = message.result;
        }
        if ("rateLimits" in results && "account" in results) finish();
      }
    });
    child.stdin.write(`${JSON.stringify(messages[0])}\n`);
  });
}

export function codexUnavailableReport(checkedAt: string): CapacityReport {
  return {
    harness: "codex",
    provider: "openai",
    generatedAt: checkedAt,
    authenticated: null,
    available: "unknown",
    windows: [],
    creditsRemaining: null,
  };
}

async function cliFallback(options: CodexProbeOptions): Promise<CapacityReport> {
  if (!options.installed) return codexUnavailableReport(options.checkedAt);
  const messages: RpcMessage[] = [
    {
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "ai-devkit", title: null, version: "1" },
        capabilities: null,
      },
    },
    { method: "initialized" },
    { id: 2, method: "account/rateLimits/read" },
    { id: 3, method: "account/read" },
  ];
  try {
    const rpc = options.rpc ?? ((requests) => appServerRpc(requests, options.timeoutMs));
    const response = await rpc(messages);
    const result = capacityFromSnapshot(
      parseCliUsage(response.rateLimits),
      options,
      response.rateLimits,
    );
    const accountEnvelope = record(response.account);
    if (
      accountEnvelope &&
      Object.hasOwn(accountEnvelope, "account") &&
      !record(accountEnvelope.account)
    ) {
      result.authenticated = false;
      result.available = "unknown";
    }
    return result;
  } catch {
    return codexUnavailableReport(options.checkedAt);
  }
}

async function subscriptionSnapshot(
  access: string,
  accountId: string,
  source: "pat" | "oauth",
  options: CodexProbeOptions,
): Promise<UsageSnapshot> {
  const snapshot = await fetchOpenAiSubscriptionCapacity({ access, accountId }, options);
  if (snapshot.authenticated === false) throw new Error("unauthorized");
  return {
    windows: snapshot.windows,
    creditsRemaining: snapshot.creditsRemaining,
    source,
  };
}

export async function probeCodexCapacity(options: CodexProbeOptions): Promise<CapacityReport> {
  const credentials = await resolveCodexCredentials(options);
  if (!credentials) return cliFallback(options);

  if (credentials.personalAccessToken) {
    try {
      const accountId = await fetchOpenAiPatAccountId(credentials.personalAccessToken, options);
      const snapshot = await subscriptionSnapshot(
        credentials.personalAccessToken,
        accountId,
        "pat",
        options,
      );
      return capacityFromSnapshot(snapshot, options);
    } catch {
      // Continue to a separately available OAuth credential before using the CLI.
    }
  }

  if (credentials.oauth) {
    try {
      const snapshot = await subscriptionSnapshot(
        credentials.oauth.access,
        credentials.oauth.accountId,
        "oauth",
        options,
      );
      return capacityFromSnapshot(snapshot, options);
    } catch {
      return cliFallback(options);
    }
  }
  return cliFallback(options);
}
