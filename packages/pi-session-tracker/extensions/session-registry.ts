import * as fs from "node:fs";
import * as path from "node:path";

export type SessionRegistry = Record<string, string>;

const STALE_LOCK_MS = 30_000;
const LOCK_RETRY_MS = 50;
const LOCK_WAIT_MS = 10_000;

export class RegistryUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryUnreadableError";
  }
}

function sleepMs(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin */
  }
}

function tryAcquireLock(lockPath: string, staleMs: number): boolean {
  try {
    fs.closeSync(fs.openSync(lockPath, "wx", 0o600));
    return true;
  } catch {
    try {
      const age = Date.now() - fs.statSync(lockPath).mtimeMs;
      if (age > staleMs) {
        fs.unlinkSync(lockPath);
        fs.closeSync(fs.openSync(lockPath, "wx", 0o600));
        return true;
      }
    } catch {
      /* races with the holder are fine — losing means we wait */
    }
    return false;
  }
}

function releaseLock(lockPath: string): void {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* already gone */
  }
}

export function withRegistryLock<T>(registryFile: string, fn: () => T): T {
  fs.mkdirSync(path.dirname(registryFile), { recursive: true });
  const lockPath = `${registryFile}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    if (tryAcquireLock(lockPath, STALE_LOCK_MS)) {
      try {
        return fn();
      } finally {
        releaseLock(lockPath);
      }
    }
    sleepMs(LOCK_RETRY_MS);
  }
  throw new Error(`timed out acquiring lock for ${registryFile}`);
}

/** Read the registry for an update. Missing file → empty object; corrupt file → error. */
export function readRegistryForUpdate(file: string): SessionRegistry {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as SessionRegistry;
    }
    throw new RegistryUnreadableError("sessions.json is not a JSON object");
  } catch (e) {
    if (e instanceof RegistryUnreadableError) throw e;
    throw new RegistryUnreadableError("sessions.json is not valid JSON");
  }
}

export function writeRegistry(file: string, data: SessionRegistry): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

/**
 * Locked read-modify-write. Returns false when the file exists but is not
 * readable JSON so callers never clobber a partially written document.
 */
export function updateRegistry(
  file: string,
  mutator: (registry: SessionRegistry) => void,
): boolean {
  try {
    withRegistryLock(file, () => {
      const registry = readRegistryForUpdate(file);
      mutator(registry);
      writeRegistry(file, registry);
    });
    return true;
  } catch (e) {
    if (e instanceof RegistryUnreadableError) return false;
    throw e;
  }
}
