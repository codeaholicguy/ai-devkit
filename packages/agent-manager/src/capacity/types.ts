export type Availability = "yes" | "no" | "unknown";
export type CapacityLimitType = "TOKENS_LIMIT" | "CREDIT_LIMIT" | "TIME_LIMIT";

export interface CapacityWindow {
  id: string;
  label: string;
  durationMinutes: number | null;
  usedPercent: number | null;
  resetsAt: string | null;
  limitType?: CapacityLimitType;
  total?: number | null;
  current?: number | null;
  remaining?: number | null;
}

export interface CapacityReport {
  /** Harness whose quota pool is measured, e.g. "pi" or "codex". */
  harness: string;
  /** Model provider backing the harness, e.g. "zai" or "openai". */
  provider: string;
  generatedAt: string;
  authenticated: boolean | null;
  available: Availability;
  windows: CapacityWindow[];
  creditsRemaining: number | null;
}
