import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const hookPath = fileURLToPath(
  new URL("../../../assets/codex/codex-session-mapping.cjs", import.meta.url),
);

function runHook(
  home: string,
  pid: string,
  sessionFile: string,
  extraEnv: Record<string, string> = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const child = spawn(process.execPath, [hookPath], {
      env: {
        ...process.env,
        HOME: home,
        CODEX_PID: pid,
        CODEX_SESSION_FILE: sessionFile,
        ...extraEnv,
      },
      stdio: ["pipe", "ignore", "pipe"],
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.stdin?.end("{}");
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`hook exited ${code}: ${stderr}`));
    });
  });
}

describe("codex-session-mapping registry", () => {
  let home: string;
  let registryPath: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "codex-registry-"));
    registryPath = path.join(home, ".codex", "ai-devkit", "sessions.json");
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("merges concurrent hook runs without dropping pid entries", async () => {
    await Promise.all([
      runHook(home, "4242", "/tmp/a.jsonl"),
      runHook(home, "4343", "/tmp/b.jsonl"),
      runHook(home, "4444", "/tmp/c.jsonl"),
    ]);

    expect(JSON.parse(fs.readFileSync(registryPath, "utf8"))).toEqual({
      "4242": "/tmp/a.jsonl",
      "4343": "/tmp/b.jsonl",
      "4444": "/tmp/c.jsonl",
    });
  });

  it("quarantines a corrupt registry and records the pid on exit 0", async () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, "{not json");

    await runHook(home, "5151", "/tmp/live.jsonl");

    expect(JSON.parse(fs.readFileSync(registryPath, "utf8"))).toEqual({
      "5151": "/tmp/live.jsonl",
    });
    expect(
      fs
        .readdirSync(path.dirname(registryPath))
        .some((name) => name.startsWith("sessions.json.corrupt-")),
    ).toBe(true);
  });

  it("exits 0 when the lock wait times out without writing", async () => {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.closeSync(fs.openSync(`${registryPath}.lock`, "wx", 0o600));

    await runHook(home, "5252", "/tmp/skipped.jsonl", {
      AI_DEVKIT_SESSION_REGISTRY_LOCK_WAIT_MS: "100",
    });

    expect(fs.existsSync(registryPath)).toBe(false);
  });
});
