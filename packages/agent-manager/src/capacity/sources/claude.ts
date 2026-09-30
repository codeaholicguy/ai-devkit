import {
  fetchAnthropicCapacity,
  type AnthropicCapacityRequestOptions,
} from "../providers/anthropic.js";
import type { CapacityReport, ProviderCapacitySnapshot } from "../types.js";
import {
  resolveClaudeAnthropicToken,
  type ClaudeCredentialOptions,
} from "../../harnesses/claude/credentials.js";

export type ClaudeCapacityOptions = ClaudeCredentialOptions & AnthropicCapacityRequestOptions;

export type ClaudeProbeOptions = ClaudeCapacityOptions & {
  checkedAt: string;
};

function claudeReport(snapshot: ProviderCapacitySnapshot, checkedAt: string): CapacityReport {
  return {
    harness: "claude",
    provider: "anthropic",
    generatedAt: checkedAt,
    ...snapshot,
  };
}

export async function probeClaudeCapacity(options: ClaudeProbeOptions): Promise<CapacityReport> {
  const token = await resolveClaudeAnthropicToken(options);
  const snapshot = await fetchAnthropicCapacity(token, options);
  return claudeReport(snapshot, options.checkedAt);
}
