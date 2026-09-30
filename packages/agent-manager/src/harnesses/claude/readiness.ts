import { join } from "node:path";
import {
  record,
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
    const result = await runtime.runCommand("claude", ["auth", "status", "--json"]);
    const parsed = record(JSON.parse(result.stdout));
    const authenticated = parsed?.loggedIn === true || parsed?.authenticated === true;
    const unauthenticated = parsed?.loggedIn === false || parsed?.authenticated === false;
    return {
      state: authenticated ? "authenticated" : unauthenticated ? "unauthenticated" : "unknown",
      source: "claude auth status --json",
      provider: null,
      availableProviders: [],
      status: authenticated ? "pass" : unauthenticated ? "fail" : "warn",
      errors: authenticated
        ? []
        : [unauthenticated ? "Claude is not authenticated" : "Claude authentication is unknown"],
    };
  } catch {
    return {
      state: "unknown",
      source: "claude auth status --json",
      provider: null,
      availableProviders: [],
      status: "warn",
      errors: ["Claude authentication probe failed"],
    };
  }
}

async function integrationCheck(runtime: ReadinessRuntime): Promise<IntegrationReadinessCheck> {
  const script = await scriptCheck(
    join(runtime.homeDir, ".claude", "hooks", "claude-prompt-hook.js"),
    join(runtime.assetRoot ?? "", "claude", "claude-prompt-hook.js"),
    runtime,
  );
  const registration = await registrationCheck(
    join(runtime.homeDir, ".claude", "settings.json"),
    "PreToolUse",
    "node ~/.claude/hooks/claude-prompt-hook.js",
    runtime,
  );
  const installed = script.status === "pass" && registration.status === "pass";
  return {
    label: "ai-devkit hook",
    installed,
    status: worstReadinessStatus([script.status, registration.status]),
    errors: [...script.errors, ...registration.errors],
    details: { promptScript: script, registration },
  };
}

export const claudeReadiness: HarnessReadinessProfile = {
  configDir: ".claude",
  auth: authCheck,
  integration: integrationCheck,
};
