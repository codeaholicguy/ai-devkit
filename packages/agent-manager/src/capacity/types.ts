export type ProviderStatus = 'supported' | 'unsupported' | 'unauthenticated' | 'unavailable' | 'unknown';
export type Availability = 'yes' | 'no' | 'unknown';
export type CapacitySource = 'provider-cli' | 'provider-api' | 'local-observation' | 'none';

export interface CapacityWindow {
  id: string;
  label: string;
  durationMinutes: number | null;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetsAt: string | null;
  scope: string | null;
}

export type CodexUsageSource = 'pat' | 'oauth' | 'cli';

export interface UsageSnapshot {
  sessionLimit: CapacityWindow | null;
  weeklyLimit: CapacityWindow | null;
  creditsRemaining: number | null;
  codexCreditLimit: number | null;
  extraRateWindows: CapacityWindow[];
  source: CodexUsageSource;
  updatedAt: string;
}

export interface ProviderCapacity {
  provider: string;
  agentType: string | null;
  configured: boolean;
  installed: boolean;
  authenticated: boolean | null;
  status: ProviderStatus;
  available: Availability;
  plan: string | null;
  checkedAt: string;
  source: CapacitySource;
  windows: CapacityWindow[];
  aliases: { dailyWindowId: string | null; weeklyWindowId: string | null };
  resetCredits?: { available: number | null };
  usage?: UsageSnapshot;
  warnings: Array<{ code: string; message: string }>;
  error?: { code: string; retryable: boolean };
}

export interface CapacityReport {
  schemaVersion: 1;
  generatedAt: string;
  providers: ProviderCapacity[];
}
