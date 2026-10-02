import fs from "fs-extra";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { reconcileAndInstall } from "../../../services/install/install.service.js";

describe("project application integration", () => {
  let projectRoot: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-devkit-install-"));
    process.chdir(projectRoot);
    await fs.writeJson(path.join(projectRoot, ".ai-devkit.json"), {
      version: "test",
      environments: ["claude", "github", "codex", "junie", "devin", "roo", "kilocode", "opencode"],
      phases: ["requirements"],
      createdAt: new Date(0).toISOString(),
      mcpServers: {
        memory: { transport: "stdio", command: "npx", args: ["-y", "@ai-devkit/memory"] },
      },
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(projectRoot);
  });

  it("creates project docs and MCP config, then matches without rewriting them", async () => {
    const desired = {
      environments: [
        "claude" as const,
        "github" as const,
        "codex" as const,
        "junie" as const,
        "devin" as const,
        "roo" as const,
        "kilocode" as const,
        "opencode" as const,
      ],
      phases: ["requirements" as const],
      registries: {},
      skills: [],
      mcpServers: {
        memory: { transport: "stdio" as const, command: "npx", args: ["-y", "@ai-devkit/memory"] },
      },
    };

    const first = await reconcileAndInstall(desired, { nonInteractive: true });
    const phasePath = path.join(projectRoot, "docs/ai/requirements/README.md");
    const mcpPath = path.join(projectRoot, ".codex/config.toml");
    const firstPhase = await fs.readFile(phasePath, "utf8");
    const firstMcp = await fs.readFile(mcpPath, "utf8");
    const mcpTargets = [
      ".mcp.json",
      ".codex/config.toml",
      ".junie/mcp/mcp.json",
      ".devin/config.json",
      ".roo/mcp.json",
      ".kilo/kilo.jsonc",
      "opencode.json",
    ];

    const second = await reconcileAndInstall(desired, { nonInteractive: true });

    expect(first.complete).toBe(true);
    for (const target of mcpTargets) {
      expect(await fs.pathExists(path.join(projectRoot, target))).toBe(true);
    }
    expect(first.mcpServers.installed).toBe(mcpTargets.length);
    expect(first.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ section: "phase", status: "installed" }),
        expect.objectContaining({ section: "mcpServer", status: "installed" }),
      ]),
    );
    expect(second.complete).toBe(true);
    expect(second.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ section: "phase", status: "skipped" }),
        expect.objectContaining({ section: "mcpServer", status: "matched" }),
      ]),
    );
    expect(await fs.readFile(phasePath, "utf8")).toBe(firstPhase);
    expect(await fs.readFile(mcpPath, "utf8")).toBe(firstMcp);
  });

  it("fails malformed MCP targets without replacing them", async () => {
    const mcpPath = path.join(projectRoot, ".codex/config.toml");
    await fs.ensureDir(path.dirname(mcpPath));
    await fs.writeFile(mcpPath, "invalid [[[");

    const report = await reconcileAndInstall(
      {
        environments: ["codex"],
        phases: [],
        registries: {},
        skills: [],
        mcpServers: { memory: { transport: "stdio", command: "npx" } },
      },
      { nonInteractive: true },
    );

    expect(report.complete).toBe(false);
    expect(report.items).toContainEqual(
      expect.objectContaining({
        section: "mcpServer",
        status: "failed",
      }),
    );
    expect(await fs.readFile(mcpPath, "utf8")).toBe("invalid [[[");
  });

  it("fails non-interactive MCP conflicts and resolves them with overwrite", async () => {
    const mcpPath = path.join(projectRoot, ".codex/config.toml");
    await fs.ensureDir(path.dirname(mcpPath));
    await fs.writeFile(mcpPath, '[mcp_servers.memory]\ncommand = "old"\n');
    const desired = {
      environments: ["codex" as const],
      phases: [],
      registries: {},
      skills: [],
      mcpServers: { memory: { transport: "stdio" as const, command: "new" } },
    };

    const conflict = await reconcileAndInstall(desired, { nonInteractive: true });
    expect(conflict.complete).toBe(false);
    expect(conflict.items).toContainEqual(expect.objectContaining({ status: "conflict" }));
    expect(await fs.readFile(mcpPath, "utf8")).toContain('command = "old"');

    const resolved = await reconcileAndInstall(desired, {
      nonInteractive: true,
      overwrite: true,
    });
    expect(resolved.complete).toBe(true);
    expect(await fs.readFile(mcpPath, "utf8")).toContain('command = "new"');
  });

  describe("skill install mode", () => {
    let registryRoot: string;
    const registryId = "local/skills";

    beforeEach(async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
      registryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-devkit-registry-"));
      for (const name of ["copied", "linked"]) {
        await fs.outputFile(
          path.join(registryRoot, "skills", name, "SKILL.md"),
          `---\nname: ${name}\ndescription: ${name} skill\n---\n`,
        );
      }
    });

    afterEach(async () => {
      vi.unstubAllGlobals();
      await fs.remove(registryRoot);
    });

    const desired = (copiedMode: "copy" | "link") => ({
      environments: ["claude" as const],
      phases: [],
      registries: { [registryId]: pathToFileURL(registryRoot).href },
      skills: [
        { registry: registryId, name: "copied", mode: copiedMode },
        { registry: registryId, name: "linked" },
      ],
      mcpServers: {},
    });
    const target = (name: string) => path.join(projectRoot, ".claude", "skills", name);

    it("copies skills in copy mode and symlinks them by default", async () => {
      const report = await reconcileAndInstall(desired("copy"), { nonInteractive: true });

      expect(report.complete).toBe(true);
      expect((await fs.lstat(target("copied"))).isSymbolicLink()).toBe(false);
      expect(await fs.readFile(path.join(target("copied"), "SKILL.md"), "utf8")).toContain(
        "copied skill",
      );
      expect((await fs.lstat(target("linked"))).isSymbolicLink()).toBe(true);
      expect((await fs.readJson(path.join(projectRoot, ".ai-devkit.json"))).skills).toEqual([
        { registry: registryId, name: "copied", mode: "copy" },
        { registry: registryId, name: "linked" },
      ]);

      const again = await reconcileAndInstall(desired("copy"), { nonInteractive: true });
      expect(again.complete).toBe(true);
      expect(again.items.filter((item) => item.section === "skill")).toEqual([
        expect.objectContaining({ name: "copied", status: "matched" }),
        expect.objectContaining({ name: "linked", status: "matched" }),
      ]);
    });

    it("reports a linked skill switched to copy mode as a conflict until --overwrite", async () => {
      await reconcileAndInstall(desired("link"), { nonInteractive: true });
      expect((await fs.lstat(target("copied"))).isSymbolicLink()).toBe(true);

      const conflict = await reconcileAndInstall(desired("copy"), { nonInteractive: true });
      expect(conflict.complete).toBe(false);
      expect(conflict.items).toContainEqual(
        expect.objectContaining({ section: "skill", name: "copied", status: "conflict" }),
      );
      expect((await fs.lstat(target("copied"))).isSymbolicLink()).toBe(true);

      const resolved = await reconcileAndInstall(desired("copy"), {
        nonInteractive: true,
        overwrite: true,
      });
      expect(resolved.complete).toBe(true);
      expect((await fs.lstat(target("copied"))).isSymbolicLink()).toBe(false);
      expect((await fs.lstat(target("linked"))).isSymbolicLink()).toBe(true);
      expect(await fs.pathExists(path.join(registryRoot, "skills", "copied", "SKILL.md"))).toBe(
        true,
      );
    });
  });
});
