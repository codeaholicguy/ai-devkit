import type {
  AuthReadinessCheck,
  HarnessReadinessProfile,
  ReadinessRuntime,
} from "../readiness/types.js";

const LOGGED_IN_PATTERN = /^Logged in/m;

async function authCheck(runtime: ReadinessRuntime): Promise<AuthReadinessCheck> {
  try {
    const result = await runtime.runCommand("devin", ["auth", "status"]);
    const authenticated = LOGGED_IN_PATTERN.test(result.stdout);
    return {
      state: authenticated ? "authenticated" : "unauthenticated",
      source: "devin auth status",
      provider: null,
      availableProviders: authenticated ? ["devin"] : [],
      status: authenticated ? "pass" : "fail",
      errors: authenticated ? [] : ["Devin is not logged in"],
    };
  } catch {
    return {
      state: "unknown",
      source: "devin auth status",
      provider: null,
      availableProviders: [],
      status: "warn",
      errors: ["Devin authentication probe failed"],
    };
  }
}

export const devinReadiness: HarnessReadinessProfile = {
  configDir: ".config/devin",
  auth: authCheck,
};
