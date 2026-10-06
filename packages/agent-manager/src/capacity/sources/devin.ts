import { DevinHttpError, fetchDevinCapacity } from "../providers/devin.js";
import type { CapacityReport } from "../types.js";
import {
  resolveDevinCredential,
  type DevinCredentialOptions,
} from "../../harnesses/devin/credentials.js";

export type DevinCapacityOptions = DevinCredentialOptions & {
  now?: () => Date;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export type DevinProbeOptions = DevinCapacityOptions & {
  checkedAt: string;
};

function devinReport(
  snapshot: Omit<CapacityReport, "harness" | "provider" | "generatedAt">,
  checkedAt: string,
): CapacityReport {
  return {
    harness: "devin",
    provider: "devin",
    generatedAt: checkedAt,
    ...snapshot,
  };
}

export async function probeDevinCapacity(options: DevinProbeOptions): Promise<CapacityReport> {
  const credential = await resolveDevinCredential(options);
  try {
    const snapshot = await fetchDevinCapacity(credential, options);
    return devinReport(snapshot, options.checkedAt);
  } catch (error) {
    if (error instanceof DevinHttpError && (error.status === 401 || error.status === 403)) {
      return devinReport(
        {
          authenticated: false,
          available: "unknown",
          windows: [],
          creditsRemaining: null,
        },
        options.checkedAt,
      );
    }
    throw error;
  }
}
