import { execFile } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const CLI_DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../../../dist/cli.js");

/**
 * End-to-end: run the BUILT `ai-devkit setup` command against an isolated
 * $HOME and assert the memory MCP wiring lands in every detected harness's
 * global config. Never touches the real environment configs.
 *
 * Note: `~/.pi` is intentionally NOT created here. Detecting pi would run the
 * pre-existing pi-session-tracker step, which requires the `pi` binary on
 * PATH — unavailable on CI runners and unrelated to memory wiring. pi's
 * honest no-MCP skip is covered by the setup service unit tests.
 */
describe.skipIf(!existsSync(CLI_DIST))("setup e2e — isolated HOME", () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "ai-devkit-setup-e2e-"));
    for (const dir of [".codex", ".claude", ".gemini", ".cursor", ".config/opencode", ".grok"]) {
      mkdirSync(join(homeDir, ...dir.split("/")), { recursive: true });
    }
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  async function runSetup(args: string[] = []): Promise<{ output: string; code: number }> {
    try {
      const { stdout, stderr } = await execFileAsync("node", [CLI_DIST, "setup", ...args], {
        env: { ...process.env, HOME: homeDir, AI_DEVKIT_TEST: "1" },
        timeout: 120_000,
      });
      return { output: `${stdout}\n${stderr}`, code: 0 };
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string; code?: number };
      return {
        output: `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`,
        code: failure.code ?? 1,
      };
    }
  }

  it(
    "wires memory MCP into every detected harness and reports skips honestly",
    { timeout: 120_000 },
    async () => {
      const { output, code } = await runSetup();

      expect(code).toBe(0);
      expect(output).toMatch(/Setup completed successfully/);

      // claude
      const claude = JSON.parse(readFileSync(join(homeDir, ".claude.json"), "utf-8"));
      expect(claude.mcpServers["ai-devkit-memory"]).toEqual({
        command: "npx",
        args: ["-y", "@ai-devkit/memory"],
      });
      // codex (TOML table)
      expect(readFileSync(join(homeDir, ".codex", "config.toml"), "utf-8")).toContain(
        "[mcp_servers.ai-devkit-memory]",
      );
      // gemini
      const gemini = JSON.parse(readFileSync(join(homeDir, ".gemini", "settings.json"), "utf-8"));
      expect(gemini.mcpServers["ai-devkit-memory"]).toBeDefined();
      // cursor
      const cursor = JSON.parse(readFileSync(join(homeDir, ".cursor", "mcp.json"), "utf-8"));
      expect(cursor.mcpServers["ai-devkit-memory"]).toBeDefined();
      // opencode
      const opencode = JSON.parse(
        readFileSync(join(homeDir, ".config", "opencode", "opencode.json"), "utf-8"),
      );
      expect(opencode.mcp["ai-devkit-memory"].command).toEqual(["npx", "-y", "@ai-devkit/memory"]);
      // grok
      const grok = JSON.parse(readFileSync(join(homeDir, ".grok", "user-settings.json"), "utf-8"));
      expect(grok.mcp.servers.some((s: { id: string }) => s.id === "ai-devkit-memory")).toBe(true);
      // pi (not present in this HOME) is skipped honestly at detection level
      expect(output).toMatch(/pi[\s\S]*~\/\.pi does not exist\./);
    },
  );

  it(
    "is idempotent on rerun (byte-stable configs, skipped steps)",
    { timeout: 240_000 },
    async () => {
      await runSetup();
      const snapshots = new Map<string, string>();
      const files = [
        [".claude.json"],
        [".codex", "config.toml"],
        [".gemini", "settings.json"],
        [".cursor", "mcp.json"],
        [".config", "opencode", "opencode.json"],
        [".grok", "user-settings.json"],
      ];
      for (const segments of files) {
        snapshots.set(segments.join("/"), readFileSync(join(homeDir, ...segments), "utf-8"));
      }

      const { output } = await runSetup();

      for (const segments of files) {
        expect(readFileSync(join(homeDir, ...segments), "utf-8")).toBe(
          snapshots.get(segments.join("/")),
        );
      }
      expect(output).toMatch(/memory-mcp.*skipped|skipped.*memory-mcp/i);
    },
  );

  it("rejects unknown --agent values with the supported list", { timeout: 120_000 }, async () => {
    const { output, code } = await runSetup(["--agent", "nonexistent-agent"]);

    expect(code).toBe(1);
    expect(output).toMatch(/Unsupported setup agent: nonexistent-agent/);
    expect(output).toMatch(/gemini/);
  });
});
