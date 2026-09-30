import type {
  AuthReadinessCheck,
  HarnessReadinessProfile,
  ReadinessRuntime,
} from "../readiness/types.js";

const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");

function authProviderNames(output: string): string[] {
  const names = new Set<string>();
  for (const line of output.replace(ANSI_ESCAPE_PATTERN, "").split(/\r?\n/)) {
    const match = /^\s*[●*+-]\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const name = match[1].replace(/\s+(?:api|oauth|[\w-]*token|[A-Z][A-Z0-9_]+)$/i, "").trim();
    if (name && !/^\d+\s+(?:credentials?|environment variables?)$/i.test(name)) names.add(name);
  }
  return [...names].sort();
}

async function authCheck(runtime: ReadinessRuntime): Promise<AuthReadinessCheck> {
  try {
    const result = await runtime.runCommand("opencode", ["auth", "list"]);
    const availableProviders = authProviderNames(result.stdout);
    const authenticated = availableProviders.length > 0;
    return {
      state: authenticated ? "authenticated" : "unauthenticated",
      source: "opencode auth list",
      provider: null,
      availableProviders,
      status: authenticated ? "pass" : "fail",
      errors: authenticated ? [] : ["OpenCode has no configured credentials"],
    };
  } catch {
    return {
      state: "unknown",
      source: "opencode auth list",
      provider: null,
      availableProviders: [],
      status: "warn",
      errors: ["OpenCode authentication probe failed"],
    };
  }
}

export const openCodeReadiness: HarnessReadinessProfile = {
  configDir: ".config/opencode",
  auth: authCheck,
};
