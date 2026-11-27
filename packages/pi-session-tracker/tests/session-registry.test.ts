import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Worker } from "node:worker_threads";
import {
  readRegistryForUpdate,
  RegistryUnreadableError,
  updateRegistry,
} from "../extensions/session-registry.js";

describe("session-registry", () => {
  let tmpDir: string;
  let registryPath: string;
  let lockWaitMs: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-registry-"));
    registryPath = path.join(tmpDir, "sessions.json");
    lockWaitMs = process.env.AI_DEVKIT_SESSION_REGISTRY_LOCK_WAIT_MS;
  });

  afterEach(() => {
    process.env.AI_DEVKIT_SESSION_REGISTRY_LOCK_WAIT_MS = lockWaitMs;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("quarantines a corrupt file under the lock and writes a fresh registry", () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, "{not json");

    expect(() => readRegistryForUpdate(registryPath)).toThrow(RegistryUnreadableError);
    expect(
      updateRegistry(registryPath, (r) => {
        r["42"] = "/sessions/a.jsonl";
      }),
    ).toBe(true);

    expect(JSON.parse(fs.readFileSync(registryPath, "utf8"))).toEqual({
      "42": "/sessions/a.jsonl",
    });
    const corruptBackup = fs
      .readdirSync(path.dirname(registryPath))
      .find((name) => name.startsWith("sessions.json.corrupt-"));
    expect(corruptBackup).toBeDefined();
    expect(fs.readFileSync(path.join(path.dirname(registryPath), corruptBackup!), "utf8")).toBe(
      "{not json",
    );
  });

  it("skips the update after the lock wait times out", () => {
    process.env.AI_DEVKIT_SESSION_REGISTRY_LOCK_WAIT_MS = "100";
    // Re-import would be needed to pick up env in module init; constants are read at load time.
    // Use a fresh dynamic import in a child process instead — see lock-timeout.worker.ts.
    const lockPath = `${registryPath}.lock`;
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.closeSync(fs.openSync(lockPath, "wx", 0o600));

    return new Promise<void>((resolve, reject) => {
      const worker = new Worker(
        new URL("./fixtures/registry-lock-timeout.worker.ts", import.meta.url),
        {
          workerData: { file: registryPath },
        },
      );
      worker.once("message", (ok: boolean) => {
        try {
          expect(ok).toBe(false);
          expect(fs.existsSync(registryPath)).toBe(false);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      worker.once("error", reject);
    });
  });

  it("keeps every pid when workers update the registry concurrently", async () => {
    const writers = Array.from({ length: 8 }, (_, i) => {
      const pid = String(10_000 + i);
      return new Worker(new URL("./fixtures/registry-writer.worker.ts", import.meta.url), {
        workerData: { file: registryPath, pid, sessionPath: `/sessions/${pid}.jsonl` },
      });
    });

    await Promise.all(
      writers.map(
        (worker) =>
          new Promise<void>((resolve, reject) => {
            worker.once("message", () => resolve());
            worker.once("error", reject);
          }),
      ),
    );
    await Promise.all(writers.map((worker) => worker.terminate()));

    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as Record<string, string>;
    for (let i = 0; i < 8; i++) {
      const pid = String(10_000 + i);
      expect(registry[pid]).toBe(`/sessions/${pid}.jsonl`);
    }
  });
});
