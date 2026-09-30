import { fetchAnthropicCapacity } from "../providers/anthropic.js";
import { fetchOpenAiPlatformCapacity } from "../providers/openai-platform.js";
import { fetchOpenAiSubscriptionCapacity } from "../providers/openai-subscription.js";
import { fetchZaiCapacity } from "../providers/zai.js";
import type { CapacityReport, ProviderCapacitySnapshot } from "../types.js";
import {
  resolvePiAnthropicCredential,
  resolvePiOpenAiCredential,
  resolvePiZaiApiKey,
  type PiCredentialOptions,
  type PiOpenAiCredential,
} from "../../harnesses/pi/credentials.js";

export type PiAnthropicCapacityOptions = PiCredentialOptions & {
  now?: () => Date;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export type PiAnthropicProbeOptions = PiAnthropicCapacityOptions & {
  checkedAt: string;
};

export type PiOpenAiCapacityOptions = PiCredentialOptions & {
  now?: () => Date;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export type PiOpenAiProbeOptions = PiOpenAiCapacityOptions & {
  checkedAt: string;
};

export type PiZaiCapacityOptions = PiCredentialOptions & {
  now?: () => Date;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export type PiZaiProbeOptions = PiZaiCapacityOptions & {
  checkedAt: string;
};

export async function probePiAnthropicCapacity(
  options: PiAnthropicProbeOptions,
): Promise<CapacityReport> {
  const credential = await resolvePiAnthropicCredential(options);
  const now = options.now?.() ?? new Date();
  if (credential.expiresMs !== null && credential.expiresMs <= now.getTime()) {
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
  const snapshot = await fetchAnthropicCapacity(credential.access, options);
  return {
    harness: "pi",
    provider: "anthropic",
    generatedAt: options.checkedAt,
    ...snapshot,
  };
}

function piOpenAiReport(snapshot: ProviderCapacitySnapshot, checkedAt: string): CapacityReport {
  return {
    harness: "pi",
    provider: "openai",
    generatedAt: checkedAt,
    ...snapshot,
  };
}

function jwtExpiryMs(token: string): number | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const exp = (payload as Record<string, unknown>).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function oauthExpired(
  credential: Extract<PiOpenAiCredential, { kind: "oauth" }>,
  nowMs: number,
): boolean {
  const expiryMs = credential.expiresMs ?? jwtExpiryMs(credential.access);
  return expiryMs !== null && expiryMs <= nowMs;
}

export async function probeOpenAiCapacity(options: PiOpenAiProbeOptions): Promise<CapacityReport> {
  const credential = await resolvePiOpenAiCredential(options);
  if (credential.kind === "platform") {
    const snapshot = await fetchOpenAiPlatformCapacity(credential.key, options);
    return piOpenAiReport(snapshot, options.checkedAt);
  }

  const nowMs = Date.parse(options.checkedAt);
  if (Number.isNaN(nowMs) || oauthExpired(credential, nowMs)) {
    return piOpenAiReport(
      {
        authenticated: true,
        available: "unknown",
        windows: [],
        creditsRemaining: null,
      },
      options.checkedAt,
    );
  }
  const snapshot = await fetchOpenAiSubscriptionCapacity(credential, options);
  return piOpenAiReport(snapshot, options.checkedAt);
}

export async function probeZaiCapacity(options: PiZaiProbeOptions): Promise<CapacityReport> {
  const key = await resolvePiZaiApiKey(options);
  const snapshot = await fetchZaiCapacity(key, options);
  return {
    harness: "pi",
    provider: "zai",
    generatedAt: options.checkedAt,
    ...snapshot,
  };
}
