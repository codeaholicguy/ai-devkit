import { join } from "node:path";
import {
  displayHome,
  mappingCheck,
  nonEmpty,
  record,
  worstReadinessStatus,
} from "../readiness/checks.js";
import type {
  AuthReadinessCheck,
  HarnessReadinessProfile,
  IntegrationReadinessCheck,
  ReadinessRuntime,
} from "../readiness/types.js";

function providerNames(parsed: Record<string, unknown>): string[] {
  const names = new Set<string>();
  if (nonEmpty(parsed.provider)) names.add((parsed.provider as string).trim());
  const providers = record(parsed.providers);
  if (providers) {
    for (const name of Object.keys(providers)) {
      if (name.trim()) names.add(name);
    }
  }
  for (const [name, value] of Object.entries(parsed)) {
    if (name === "provider" || name === "providers") continue;
    if (record(value) && name.trim()) names.add(name);
  }
  return [...names].sort();
}

async function authCheck(runtime: ReadinessRuntime): Promise<AuthReadinessCheck> {
  const sourcePath = join(runtime.homeDir, ".pi", "agent", "auth.json");
  try {
    const parsed = record(JSON.parse(await runtime.readFile(sourcePath)));
    if (!parsed) throw new Error("invalid");
    const availableProviders = providerNames(parsed);
    const provider = nonEmpty(parsed.provider) ? (parsed.provider as string).trim() : null;
    const authenticated = availableProviders.length > 0;
    return {
      state: authenticated ? "authenticated" : "unauthenticated",
      source: displayHome(sourcePath, runtime.homeDir),
      provider,
      availableProviders,
      status: authenticated ? "pass" : "fail",
      errors: authenticated ? [] : ["Pi credential file has no configured model provider"],
    };
  } catch {
    return {
      state: "unauthenticated",
      source: displayHome(sourcePath, runtime.homeDir),
      provider: null,
      availableProviders: [],
      status: "fail",
      errors: ["Pi credential file is missing or invalid"],
    };
  }
}

function isSessionTrackerListed(output: string): boolean {
  const normalized = output.toLowerCase();
  return (
    normalized.includes("@ai-devkit/pi-session-tracker") ||
    /\bsession[\s-]+tracker\b/.test(normalized)
  );
}

async function integrationCheck(runtime: ReadinessRuntime): Promise<IntegrationReadinessCheck> {
  let installed = false;
  try {
    const result = await runtime.runCommand("pi", ["list"]);
    installed = isSessionTrackerListed(result.stdout);
  } catch {
    // Safe fixed result below.
  }
  const mapping = await mappingCheck(
    join(runtime.homeDir, ".pi", "agent", "sessions.json"),
    runtime,
  );
  const mappingStatus = mapping.valid || !mapping.present ? "pass" : "fail";
  const status = worstReadinessStatus([installed ? "pass" : "fail", mappingStatus]);
  return {
    label: "ai-devkit plugin",
    installed,
    status,
    errors: [
      ...(!installed ? ["Pi session tracker is not registered"] : []),
      ...(mappingStatus === "fail" ? mapping.errors : []),
    ],
    details: {
      package: "@ai-devkit/pi-session-tracker",
      registryPath: mapping.path,
      registryValid: mapping.valid,
      invalidEntries: mapping.invalidEntries,
      staleEntries: mapping.staleEntries,
    },
  };
}

export const piReadiness: HarnessReadinessProfile = {
  configDir: ".pi",
  auth: authCheck,
  integration: integrationCheck,
};
