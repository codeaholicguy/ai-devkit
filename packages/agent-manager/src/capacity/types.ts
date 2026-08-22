export type Availability = 'yes' | 'no' | 'unknown';

export interface CapacityWindow {
  id: string;
  label: string;
  durationMinutes: number | null;
  usedPercent: number | null;
  resetsAt: string | null;
}

export interface CapacityReport {
  provider: string;
  generatedAt: string;
  authenticated: boolean | null;
  available: Availability;
  windows: CapacityWindow[];
  creditsRemaining: number | null;
}
