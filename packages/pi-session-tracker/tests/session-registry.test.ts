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

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-registry-"));
    registryPath = path.join(tmpDir, "sessions.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("rejects a corrupt existing file instead of replacing it", () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, "{not json");

    expect(() => readRegistryForUpdate(registryPath)).toThrow(RegistryUnreadableError);
    expect(
      updateRegistry(registryPath, (r) => {
        r["42"] = "/sessions/a.jsonl";
      }),
    ).toBe(false);
    expect(fs.readFileSync(registryPath, "utf8")).toBe("{not json");
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
