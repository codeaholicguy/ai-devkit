import * as fs from "node:fs";
import * as path from "node:path";

export type SessionRegistry = Record<string, string>;

const STALE_LOCK_MS = 30_000;
const LOCK_RETRY_MS = 50;
const LOCK_WAIT_MS = Number(process.env.AI_DEVKIT_SESSION_REGISTRY_LOCK_WAIT_MS) || 10_000;

export class RegistryUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryUnreadableError";
  }
}

function warn(message: string): void {
  console.warn(message);
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

/** Returns whether the lock was acquired and `fn` ran. On timeout, logs and returns false. */
export function withRegistryLock(registryFile: string, fn: () => void): boolean {
  fs.mkdirSync(path.dirname(registryFile), { recursive: true });
  const lockPath = `${registryFile}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    if (tryAcquireLock(lockPath, STALE_LOCK_MS)) {
      try {
        fn();
        return true;
      } finally {
        releaseLock(lockPath);
      }
    }
    sleepMs(LOCK_RETRY_MS);
  }
  warn(`ai-devkit: timed out acquiring lock for ${registryFile}; skipping this registry update`);
  return false;
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

function loadRegistryForUpdate(file: string): SessionRegistry {
  try {
    return readRegistryForUpdate(file);
  } catch (e) {
    if (!(e instanceof RegistryUnreadableError) || !fs.existsSync(file)) throw e;
    const corruptPath = `${file}.corrupt-${Date.now()}`;
    fs.renameSync(file, corruptPath);
    warn(
      `ai-devkit: sessions registry at ${file} was unreadable; renamed to ${corruptPath} and starting fresh`,
    );
    return {};
  }
}

export function writeRegistry(file: string, data: SessionRegistry): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

/**
 * Locked read-modify-write. Returns false when the lock could not be acquired in time.
 * Never throws for registry parse or lock errors.
 */
export function updateRegistry(
  file: string,
  mutator: (registry: SessionRegistry) => void,
): boolean {
  return withRegistryLock(file, () => {
    const registry = loadRegistryForUpdate(file);
    mutator(registry);
    writeRegistry(file, registry);
  });
}
