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
  provider: string;
  generatedAt: string;
  authenticated: boolean | null;
  available: Availability;
  windows: CapacityWindow[];
  creditsRemaining: number | null;
}
