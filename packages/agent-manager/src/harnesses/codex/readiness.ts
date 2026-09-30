import { join } from "node:path";
import {
  displayHome,
  mappingCheck,
  registrationCheck,
  scriptCheck,
  worstReadinessStatus,
} from "../readiness/checks.js";
import type {
  AuthReadinessCheck,
  HarnessReadinessProfile,
  IntegrationReadinessCheck,
  ReadinessRuntime,
} from "../readiness/types.js";

async function authCheck(runtime: ReadinessRuntime): Promise<AuthReadinessCheck> {
  try {
    const value = await runtime.codexAuth();
    return {
      state: value === true ? "authenticated" : value === false ? "unauthenticated" : "unknown",
      source: displayHome(join(runtime.homeDir, ".codex", "auth.json"), runtime.homeDir),
      provider: null,
      availableProviders: [],
      status: value === true ? "pass" : value === false ? "fail" : "warn",
      errors:
        value === true
          ? []
          : [value === false ? "Codex is not authenticated" : "Codex authentication is unknown"],
    };
  } catch {
    return {
      state: "unknown",
      source: "~/.codex/auth.json",
      provider: null,
      availableProviders: [],
      status: "warn",
      errors: ["Codex authentication probe failed"],
    };
  }
}

async function integrationCheck(runtime: ReadinessRuntime): Promise<IntegrationReadinessCheck> {
  const script = await scriptCheck(
    join(runtime.homeDir, ".codex", "hooks", "codex-session-mapping.cjs"),
    join(runtime.assetRoot ?? "", "codex", "codex-session-mapping.cjs"),
    runtime,
  );
  const registration = await registrationCheck(
    join(runtime.homeDir, ".codex", "hooks.json"),
    "SessionStart",
    "node ~/.codex/hooks/codex-session-mapping.cjs",
    runtime,
  );
  const mappingFile = await mappingCheck(
    join(runtime.homeDir, ".codex", "ai-devkit", "sessions.json"),
    runtime,
  );
  const installed = script.status === "pass" && registration.status === "pass";
  return {
    label: "ai-devkit hook",
    installed,
    status: worstReadinessStatus([script.status, registration.status, mappingFile.status]),
    errors: [...script.errors, ...registration.errors, ...mappingFile.errors],
    details: { sessionMappingScript: script, registration, mappingFile },
  };
}

export const codexReadiness: HarnessReadinessProfile = {
  configDir: ".codex",
  auth: authCheck,
  integration: integrationCheck,
};
