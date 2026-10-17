import * as os from "node:os";
import * as path from "node:path";

/**
 * Mirrors agent-manager/src/utils/homeScope.ts (daemon-client cannot depend
 * on agent-manager): $HOME is env-overridable while every identity path —
 * registry db, daemon socket legacy path — resolves from it. A sandboxed or
 * nested process can overlay it; the account home (getpwuid) is the env-
 * independent reference (issue #402).
 */
export function homeScopeMismatch(
  envHome: string | undefined = process.env.HOME,
  accountHome: string | undefined = safeAccountHome(),
): { envHome: string; accountHome: string } | null {
  if (!envHome || !accountHome) return null;
  return path.resolve(envHome) === path.resolve(accountHome)
    ? null
    : { envHome, accountHome };
}

function safeAccountHome(): string | undefined {
  try {
    return os.userInfo().homedir;
  } catch {
    return undefined;
  }
}
