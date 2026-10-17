import fs from "fs";
import os from "os";
import path from "path";

export interface HomeScopeMismatch {
  /** HOME the current process resolves (env var — drives registry + socket paths). */
  envHome: string;
  /** The account's real home (getpwuid — what the daemon and normal clients use). */
  accountHome: string;
}

/**
 * Every identity-store path — the agent registry db and the devkitd socket —
 * is resolved from `$HOME`, which is just an env var. A sandboxed or nested
 * `agent start` can overlay it while the daemon and other clients run under
 * the account's real home, producing split-brain identity: the write lands
 * where nobody looks (issue #402). This compares `$HOME` with the passwd
 * home, which ignores the env.
 */
export function homeScopeMismatch(
  envHome: string | undefined = process.env.HOME,
  accountHome: string | undefined = safeAccountHome(),
): HomeScopeMismatch | null {
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

/** Whether the `.ai-devkit` store (registry db, daemon socket) exists under `home`. */
export function identityStoreExistsUnder(home: string): boolean {
  return fs.existsSync(path.join(home, ".ai-devkit"));
}
