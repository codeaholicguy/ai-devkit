import type {
  AuthReadinessCheck,
  HarnessReadinessProfile,
  ReadinessRuntime,
} from "../readiness/types.js";

async function authCheck(runtime: ReadinessRuntime): Promise<AuthReadinessCheck> {
  try {
    await runtime.runCommand("gh", ["auth", "status", "--hostname", "github.com"]);
    return {
      state: "authenticated",
      source: "gh auth status --hostname github.com",
      provider: "github",
      availableProviders: ["GitHub"],
      status: "pass",
      errors: [],
    };
  } catch {
    return {
      state: "unknown",
      source: "gh auth status --hostname github.com",
      provider: null,
      availableProviders: ["GitHub"],
      status: "warn",
      errors: ["Copilot authentication could not be verified through GitHub CLI"],
    };
  }
}

export const copilotReadiness: HarnessReadinessProfile = {
  configDir: ".copilot",
  auth: authCheck,
};
