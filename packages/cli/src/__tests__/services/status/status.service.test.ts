import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { access as fsAccess, readFile as fsReadFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetBuiltinSkillNames = vi.hoisted(() =>
  vi.fn(async () => ["remote-one", "remote-two"]),
);

vi.mock("../../../services/skill/skill-builtins.js", () => ({
  getBuiltinSkillNames: (...args: unknown[]) =>
    mockGetBuiltinSkillNames(...args),
}));

import {
  getStatusReport,
  type StatusServiceOptions,
} from "../../../services/status/status.service.js";

type Files = Record<string, string>;

function fixture(overrides: Partial<StatusServiceOptions> = {}) {
  const homeDir = "/home/test";
  const cwd = "/repo";
  const assetRoot = "/assets";
  const builtIns = ["remote-one", "remote-two"];
  const files: Files = {
    [path.join(cwd, ".ai-devkit.json")]: JSON.stringify({
      version: "0.55.0",
      environments: ["codex", "pi", "claude"],
      phases: [],
      createdAt: "now",
      registries: {
        project: "https://example.test/project.git",
        local: "file:///work/local-registry",
        private:
          "https://user:registry-secret@example.test/private.git?token=query-secret",
      },
    }),
    [path.join(homeDir, ".ai-devkit", ".ai-devkit.json")]: JSON.stringify({
      registries: { global: "https://example.test/global.git" },
    }),
    [path.join(homeDir, ".ai-devkit", "channels.json")]: JSON.stringify({
      channels: {
        telegram: {
          type: "telegram",
          enabled: true,
          createdAt: "now",
          config: {
            botToken: "telegram-secret",
            botUsername: "safe-bot",
            authorizedChatId: 42,
          },
        },
        slack: {
          type: "slack",
          enabled: true,
          createdAt: "now",
          config: {
            appToken: "xapp-secret",
            botToken: "xoxb-secret",
            botUserId: "B1",
            workspaceId: "W1",
            transport: "socket-mode",
            audience: "dm",
          },
        },
      },
    }),
    [path.join(homeDir, ".codex", "hooks", "codex-session-mapping.cjs")]:
      "codex-hook",
    [path.join(assetRoot, "codex", "codex-session-mapping.cjs")]: "codex-hook",
    [path.join(homeDir, ".codex", "hooks.json")]: JSON.stringify({
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: "node ~/.codex/hooks/codex-session-mapping.cjs",
              },
            ],
          },
        ],
      },
    }),
    [path.join(homeDir, ".codex", "ai-devkit", "sessions.json")]:
      JSON.stringify({
        "123": "/sessions/codex.jsonl",
      }),
    "/sessions/codex.jsonl": "",
    [path.join(homeDir, ".claude", "hooks", "claude-prompt-hook.js")]:
      "claude-hook",
    [path.join(assetRoot, "claude", "claude-prompt-hook.js")]: "claude-hook",
    [path.join(homeDir, ".claude", "settings.json")]: JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                type: "command",
                command: "node ~/.claude/hooks/claude-prompt-hook.js",
              },
            ],
          },
        ],
      },
    }),
    [path.join(homeDir, ".pi", "agent", "sessions.json")]: JSON.stringify({
      "456": "/sessions/pi.jsonl",
    }),
    "/sessions/pi.jsonl": "",
    [path.join(homeDir, ".pi", "agent", "auth.json")]: JSON.stringify({
      provider: "anthropic",
    }),
  };
  for (const directory of [
    ".codex",
    ".pi",
    ".claude",
    ".copilot",
    ".gemini",
    ".grok",
    ".kiro",
    ".gemini/antigravity-cli",
    ".config/opencode",
  ]) {
    files[path.join(homeDir, directory)] = "<dir>";
  }
  for (const [agent, skillRoot] of [
    ["codex", path.join(homeDir, ".codex", "skills")],
    ["pi", path.join(homeDir, ".pi", "agent", "skills")],
    ["claude", path.join(homeDir, ".claude", "skills")],
    ["copilot", path.join(homeDir, ".copilot", "skills")],
    ["gemini_cli", path.join(homeDir, ".gemini", "skills")],
    ["grok_cli", path.join(homeDir, ".grok", "skills")],
    ["antigravity_cli", path.join(homeDir, ".gemini", "config", "skills")],
    ["opencode", path.join(homeDir, ".config", "opencode", "skills")],
  ] as const) {
    void agent;
    for (const skill of builtIns)
      files[path.join(skillRoot, skill, "SKILL.md")] = "# skill";
  }
  const executablePaths: Record<string, string> = {
    codex: "/bin/codex",
    pi: "/bin/pi",
    claude: "/bin/claude",
    copilot: "/bin/copilot",
    gemini_cli: "/bin/gemini",
    grok_cli: "/bin/grok",
    kiro: "/bin/kiro-cli",
    antigravity_cli: "/bin/agy",
    opencode: "/bin/opencode",
    tmux: "/bin/tmux",
  };
  const options: StatusServiceOptions = {
    cwd,
    homeDir,
    path: "/bin",
    assetRoot,
    installedVersion: "0.55.0",
    now: () => new Date("2026-08-23T00:00:00.000Z"),
    readFile: async (target) => {
      if (!(target in files))
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return files[target];
    },
    access: async (target, mode) => {
      expect(mode).toBeTypeOf("number");
      if (Object.values(executablePaths).includes(target) || target in files)
        return;
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
    runCommand: vi.fn(async (command, args) => {
      if (command === "tmux") return { stdout: "tmux 3.4\n", stderr: "" };
      if (command === "pi")
        return { stdout: "@ai-devkit/pi-session-tracker\n", stderr: "" };
      if (command === "claude")
        return { stdout: JSON.stringify({ loggedIn: true }), stderr: "" };
      if (command === "gh")
        return {
          stdout: "github.com\n  Logged in to github.com account test-user\n",
          stderr: "",
        };
      if (command === "opencode")
        return { stdout: "●  litellm api\n●  OpenAI oauth\n", stderr: "" };
      if (command === "npm") return { stdout: "0.56.0\n", stderr: "" };
      throw new Error(`unexpected command ${command} ${args.join(" ")}`);
    }),
    codexAuth: async () => true,
    ...overrides,
  };
  return { options, files };
}

describe("getStatusReport", () => {
  it("builds the canonical per-agent readiness report from verifiable sources", async () => {
    const { options } = fixture();
    const report = await getStatusReport(options);

    expect(report.generatedAt).toBe("2026-08-23T00:00:00.000Z");
    expect(report.agents.codex.executable.path).toBe("/bin/codex");
    expect(report.agents.codex.auth.state).toBe("authenticated");
    expect(report.agents.codex.integration).toMatchObject({
      label: "ai-devkit hook",
      installed: true,
      status: "pass",
    });
    expect(report.agents.pi.integration).toMatchObject({
      label: "ai-devkit plugin",
      installed: true,
      status: "pass",
    });
    expect(report.agents.claude.integration).toMatchObject({
      label: "ai-devkit hook",
      installed: true,
      status: "pass",
    });
    expect(Object.keys(report.agents)).toEqual([
      "claude",
      "codex",
      "gemini_cli",
      "grok_cli",
      "kiro",
      "antigravity_cli",
      "opencode",
      "copilot",
      "pi",
      "devin",
    ]);
    expect(report.agents.copilot.integration).toBeUndefined();
    expect(report.agents.gemini_cli.builtInSkills).toMatchObject({ present: 2, required: 2 });
    expect(report.agents.antigravity_cli.builtInSkills).toMatchObject({ present: 2, required: 2 });
    expect(report.agents.kiro.builtInSkills).toMatchObject({
      path: null,
      present: 0,
      required: 2,
      missing: ["remote-one", "remote-two"],
    });
    expect(report.agents.opencode.auth?.status).toBe("pass");
    expect(report.agents.copilot.auth?.status).toBe("pass");
    expect(report.tmux).toMatchObject({
      path: "tmux",
      available: true,
      version: "3.4",
    });
    expect(report.registries.project.configured).toMatchObject({
      project: "https://example.test/project.git",
    });
    expect(report.registries.project.configured.local).toBe(
      "local: /work/local-registry",
    );
    expect(report.registries.global.configured).toEqual({
      global: "https://example.test/global.git",
    });
    expect(report.registries.global.source).toBe(
      path.join(options.homeDir!, ".ai-devkit", ".ai-devkit.json"),
    );
    expect(report.aiDevkit).toMatchObject({
      installedVersion: "0.55.0",
      latestVersion: "0.56.0",
      updateAvailable: true,
    });
    expect(report.project.config).toMatchObject({
      present: true,
      valid: true,
      environments: ["codex", "pi", "claude"],
    });
    expect(report.channels.connections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "telegram", ready: true }),
        expect.objectContaining({ name: "slack", ready: true }),
      ]),
    );
    expect(report.channels.config.path).toBe(
      path.join(options.homeDir!, ".ai-devkit", "channels.json"),
    );
    expect(report.checks.warnings).toBe(0);
    expect(report.registries.project.configured.private).toBe(
      "https://example.test/private.git",
    );
    expect(JSON.stringify(report)).not.toContain("registry-secret");
    expect(JSON.stringify(report)).not.toContain("query-secret");
  });

  it("checks built-in skills concurrently across each agent skill root", async () => {
    const { options } = fixture();
    let activeSkillChecks = 0;
    let maxActiveSkillChecks = 0;
    const baseAccess = options.access!;
    const access: StatusServiceOptions["access"] = async (target, mode) => {
      if (!target.endsWith("SKILL.md")) return baseAccess(target, mode);
      activeSkillChecks += 1;
      maxActiveSkillChecks = Math.max(maxActiveSkillChecks, activeSkillChecks);
      await new Promise((resolve) => setTimeout(resolve, 1));
      try {
        await baseAccess(target, mode);
      } finally {
        activeSkillChecks -= 1;
      }
    };

    const report = await getStatusReport({ ...options, access });

    expect(maxActiveSkillChecks).toBeGreaterThan(3);
    expect(report.agents.codex.builtInSkills).toMatchObject({
      required: 2,
      present: 2,
      missing: [],
    });
    expect(mockGetBuiltinSkillNames).toHaveBeenCalled();
  });

  it("uses the shared tmux inspection without a PATH preflight", async () => {
    const { options } = fixture({
      path: "",
      runCommand: vi.fn(async (command, args) => {
        if (command === "tmux") return { stdout: "tmux 3.5\n", stderr: "" };
        if (command === "pi")
          return { stdout: "@ai-devkit/pi-session-tracker\n", stderr: "" };
        if (command === "claude")
          return { stdout: JSON.stringify({ loggedIn: true }), stderr: "" };
        if (command === "gh")
          return {
            stdout: "github.com\n  Logged in to github.com account test-user\n",
            stderr: "",
          };
        if (command === "opencode")
          return { stdout: "●  litellm api\n", stderr: "" };
        if (command === "npm") return { stdout: "0.56.0\n", stderr: "" };
        throw new Error(`unexpected command ${command} ${args.join(" ")}`);
      }),
    });

    const report = await getStatusReport(options);

    expect(report.tmux).toMatchObject({
      path: "tmux",
      available: true,
      version: "3.5",
      status: "pass",
    });
  });

  it("excludes adapters without executables from scored readiness checks", async () => {
    const { options } = fixture();
    const baseAccess = options.access!;
    const access: StatusServiceOptions["access"] = async (target, mode) => {
      if (
        target === "/bin/grok" ||
        target === path.join(options.homeDir!, ".grok")
      ) {
        throw new Error("missing");
      }
      return baseAccess(target, mode);
    };

    const report = await getStatusReport({ ...options, access });

    expect(report.agents.grok_cli.executable).toMatchObject({
      path: null,
      status: "fail",
    });
    expect(report.agents.grok_cli.globalConfig.status).toBe("fail");
    expect(report.overall).toBe("pass");
    expect(report.checks.failed).toBe(0);
  });

  it("warns when project configuration is missing", async () => {
    const { options, files } = fixture();
    delete files[path.join(options.cwd!, ".ai-devkit.json")];

    const report = await getStatusReport(options);

    expect(report.project.config).toMatchObject({
      present: false,
      valid: false,
      status: "warn",
      errors: ["project configuration is missing"],
    });
    expect(report.overall).toBe("warn");
    expect(report.checks.failed).toBe(0);
  });

  it("returns independent findings when files, commands, auth, and npm are unavailable", async () => {
    const { options } = fixture({
      access: async () => {
        throw new Error("SECRET access failure");
      },
      readFile: async () => {
        throw new Error("SECRET file failure");
      },
      runCommand: async () => {
        throw new Error("SECRET command failure");
      },
      codexAuth: async () => null,
    });
    const report = await getStatusReport(options);
    const serialized = JSON.stringify(report);

    expect(report.agents.codex.executable.status).toBe("fail");
    expect(report.agents.claude.auth.state).toBe("unknown");
    expect(report.project.config.present).toBe(false);
    expect(report.aiDevkit.latestVersion).toBeNull();
    expect(report.overall).toBe("fail");
    expect(serialized).not.toContain("SECRET");
    expect(report.agents.codex).toBeDefined();
    expect(report.agents.pi).toBeDefined();
    expect(report.agents.claude).toBeDefined();
  });

  it("reports malformed mappings and channel config without exposing their contents", async () => {
    const { options, files } = fixture();
    files[path.join(options.homeDir!, ".codex", "ai-devkit", "sessions.json")] =
      "{token-secret";
    files[path.join(options.homeDir!, ".ai-devkit", "channels.json")] =
      "{channel-secret";

    const report = await getStatusReport(options);
    const serialized = JSON.stringify(report);
    expect(report.agents.codex.integration?.details?.mappingFile).toMatchObject(
      { status: "fail" },
    );
    expect(report.channels.config).toMatchObject({
      present: true,
      validJson: false,
      validSchema: false,
    });
    expect(serialized).not.toContain("token-secret");
    expect(serialized).not.toContain("channel-secret");
  });

  it("reports channel schema as informational when an entry is structurally incomplete", async () => {
    const { options, files } = fixture();
    files[path.join(options.homeDir!, ".ai-devkit", "channels.json")] =
      JSON.stringify({
        channels: {
          broken: {
            type: "slack",
            enabled: true,
            config: { appToken: "xapp-secret" },
          },
        },
      });
    const report = await getStatusReport(options);
    expect(report.channels.config).toMatchObject({
      validJson: true,
      validSchema: false,
    });
    expect(report.channels.connections[0]).toMatchObject({
      ready: false,
      errors: ["channel configuration is not ready"],
    });
    expect(report.registries).not.toHaveProperty("status");
    expect(report.channels).not.toHaveProperty("status");
    expect(report.channels.connections[0]).not.toHaveProperty("status");
  });
});

describe("getStatusReport memory mcp wiring", () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "ai-devkit-status-mcp-"));
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  function run() {
    const { options } = fixture();
    const { access, readFile } = options;
    return getStatusReport({
      ...options,
      homeDir,
      access: async (target, mode) => {
        if (target.startsWith(homeDir)) return fsAccess(target, mode);
        return access?.(target, mode);
      },
      readFile: async (target) => {
        if (target.startsWith(homeDir)) return fsReadFile(target, "utf8");
        return readFile?.(target) ?? "";
      },
    });
  }

  it("reports no wiring targets when no agent dot-folders exist", async () => {
    const report = await run();
    expect(report.memoryMcp.status).toBe("pass");
    expect(report.memoryMcp.agents).toEqual([]);
  }, 15000);

  it("reports unwired for a detected agent without config", async () => {
    mkdirSync(join(homeDir, ".gemini"), { recursive: true });
    const report = await run();
    expect(report.memoryMcp.agents).toContainEqual(
      expect.objectContaining({ agent: "gemini", state: "unwired" }),
    );
    expect(report.memoryMcp.status).toBe("warn");
  }, 15000);

  it("reports wired after the config entry exists", async () => {
    mkdirSync(join(homeDir, ".cursor"), { recursive: true });
    writeFileSync(
      join(homeDir, ".cursor", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          "ai-devkit-memory": { command: "npx", args: ["-y", "@ai-devkit/memory"] },
        },
      }),
    );
    const report = await run();
    expect(report.memoryMcp.agents).toContainEqual(
      expect.objectContaining({ agent: "cursor", state: "wired" }),
    );
    expect(report.memoryMcp.status).toBe("pass");
  }, 15000);

  it("reports unsupported for pi without failing the check", async () => {
    mkdirSync(join(homeDir, ".pi"), { recursive: true });
    const report = await run();
    expect(report.memoryMcp.agents).toContainEqual(
      expect.objectContaining({ agent: "pi", state: "unsupported" }),
    );
    expect(report.memoryMcp.status).toBe("pass");
  }, 15000);

  it("reports error state for malformed config", async () => {
    mkdirSync(join(homeDir, ".grok"), { recursive: true });
    writeFileSync(join(homeDir, ".grok", "user-settings.json"), "{ broken");
    const report = await run();
    expect(report.memoryMcp.agents).toContainEqual(
      expect.objectContaining({ agent: "grok", state: "error" }),
    );
    expect(report.memoryMcp.status).toBe("warn");
  }, 15000);
});
