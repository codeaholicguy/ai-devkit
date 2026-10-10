import { join } from "node:path";
import { displayHome, record } from "../readiness/checks.js";
import type {
  AuthReadinessCheck,
  HarnessReadinessProfile,
  ReadinessRuntime,
} from "../readiness/types.js";

async function authCheck(runtime: ReadinessRuntime): Promise<AuthReadinessCheck> {
  const sourcePath = join(runtime.homeDir, ".config", "muse", "auth.json");
  try {
    const parsed = record(JSON.parse(await runtime.readFile(sourcePath)));
    if (!parsed) throw new Error("invalid");
    const authenticated = Object.keys(parsed).length > 0;
    return {
      state: authenticated ? "authenticated" : "unauthenticated",
      source: displayHome(sourcePath, runtime.homeDir),
      provider: null,
      availableProviders: [],
      status: authenticated ? "pass" : "fail",
      errors: authenticated ? [] : ["Muse credential file has no entries"],
    };
  } catch {
    return {
      state: "unauthenticated",
      source: displayHome(sourcePath, runtime.homeDir),
      provider: null,
      availableProviders: [],
      status: "fail",
      errors: ["Muse credential file is missing or invalid"],
    };
  }
}

export const museReadiness: HarnessReadinessProfile = {
  configDir: ".config/muse",
  auth: authCheck,
};
