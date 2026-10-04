import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  getAgentReadinessReport,
  getAgentReadinessReports,
  type AgentReadinessOptions,
  type ReadinessAgentType,
} from "../../../harnesses/readiness/AgentReadiness.js";
import { HARNESS_RUNTIME_PROFILES } from "../../../harnesses/runtimeProfiles.js";

type Files = Record<string, string>;

const builtInSkillNames = ["agent-management", "memory", "verify"];
const skillRoots: Record<string, string> = {
  claude: ".claude/skills",
  codex: ".codex/skills",
  copilot: ".copilot/skills",
  gemini_cli: ".gemini/skills",
  grok_cli: ".grok/skills",
  antigravity_cli: ".gemini/config/skills",
  opencode: ".config/opencode/skill",
  pi: ".pi/agent/skills",
};

function fixture(overrides: Partial<AgentReadinessOptions> = {}) {
  const homeDir = "/home/test";
  const assetRoot = "/assets";
  const files: Files = {
    [path.join(homeDir, ".codex", "hooks", "codex-session-mapping.cjs")]: "codex-hook",
    [path.join(assetRoot, "codex", "codex-session-mapping.cjs")]: "codex-hook",
    [path.join(homeDir, ".codex", "hooks.json")]: JSON.stringify({
      hooks: {
        SessionStart: [
          {
            hooks: [{ type: "command", command: "node ~/.codex/hooks/codex-session-mapping.cjs" }],
          },
        ],
      },
    }),
    [path.join(homeDir, ".codex", "ai-devkit", "sessions.json")]: JSON.stringify({
      "123": "/sessions/codex.jsonl",
    }),
    "/sessions/codex.jsonl": "",
    [path.join(homeDir, ".claude", "hooks", "claude-prompt-hook.js")]: "claude-hook",
    [path.join(assetRoot, "claude", "claude-prompt-hook.js")]: "claude-hook",
    [path.join(homeDir, ".claude", "settings.json")]: JSON.stringify({
      hooks: {
        PreToolUse: [
          { hooks: [{ type: "command", command: "node ~/.claude/hooks/claude-prompt-hook.js" }] },
        ],
      },
    }),
    [path.join(homeDir, ".pi", "agent", "sessions.json")]: JSON.stringify({
      "456": "/sessions/missing-pi.jsonl",
    }),
    [path.join(homeDir, ".pi", "agent", "auth.json")]: JSON.stringify({
      anthropic: { access: "access-secret", refresh: "refresh-secret" },
      litellm: { key: "litellm-secret", env: { LITELLM_BASE_URL: "https://litellm.example.test" } },
    }),
  };
  for (const directory of [
    ".claude",
    ".codex",
    ".copilot",
    ".gemini",
    ".grok",
    ".kiro",
    ".gemini/antigravity-cli",
    ".config/opencode",
    ".config/devin",
    ".pi",
  ]) {
    files[path.join(homeDir, directory)] = "<dir>";
  }
  for (const root of Object.values(skillRoots)) {
    for (const skill of builtInSkillNames) {
      files[path.join(homeDir, root, skill, "SKILL.md")] = "# skill";
    }
  }
  const executablePaths = Object.values(HARNESS_RUNTIME_PROFILES).map((agent) =>
    path.join("/bin", agent.command),
  );
  const options: AgentReadinessOptions = {
    homeDir,
    path: "/bin",
    assetRoot,
    builtInSkillNames,
    skillRoots,
    readFile: async (target) => {
      if (!(target in files)) throw new Error("missing");
      return files[target];
    },
    access: async (target) => {
      if (executablePaths.includes(target) || target in files) return;
      throw new Error("missing");
    },
    runCommand: vi.fn(async (command) => {
      if (command === "pi") return { stdout: "npm:@ai-devkit/pi-session-tracker\n", stderr: "" };
      if (command === "claude") return { stdout: JSON.stringify({ loggedIn: true }), stderr: "" };
      if (command === "gh")
        return { stdout: "github.com\n  Logged in to github.com account test-user\n", stderr: "" };
      if (command === "opencode")
        return { stdout: "●  litellm api\n●  OpenAI oauth\n", stderr: "" };
      if (command === "devin")
        return { stdout: "Logged in (via Devin).\n\nUser:\n  Name: test-user\n", stderr: "" };
      throw new Error(`unexpected command ${command}`);
    }),
    codexAuth: async () => true,
    ...overrides,
  };
  return { options, files };
}

describe("agent readiness", () => {
  it("reports every readiness-supported adapter with generic checks and only real integrations", async () => {
    const { options } = fixture();

    const reports = await getAgentReadinessReports(options);

    expect(Object.keys(reports)).toEqual([
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
    for (const [agent, report] of Object.entries(reports) as Array<
      [ReadinessAgentType, (typeof reports)[ReadinessAgentType]]
    >) {
      expect(report.type).toBe(agent);
      expect(report.executable.status).toBe("pass");
      expect(report.globalConfig.status).toBe("pass");
      expect(report.builtInSkills.status).toBe("info");
    }
    expect(reports.gemini_cli.builtInSkills).toMatchObject({ present: 3, required: 3 });
    expect(reports.antigravity_cli.builtInSkills).toMatchObject({ present: 3, required: 3 });
    expect(reports.kiro.builtInSkills).toMatchObject({
      path: null,
      present: 0,
      required: 3,
      missing: builtInSkillNames,
    });
    expect(reports.codex.integration).toMatchObject({
      label: "ai-devkit hook",
      installed: true,
      status: "pass",
    });
    expect(reports.claude.integration).toMatchObject({
      label: "ai-devkit hook",
      installed: true,
      status: "pass",
    });
    expect(reports.pi.integration).toMatchObject({
      label: "ai-devkit plugin",
      installed: true,
      status: "pass",
    });
    expect(reports.copilot.integration).toBeUndefined();
    expect(reports.gemini_cli.integration).toBeUndefined();
    expect(reports.grok_cli.integration).toBeUndefined();
    expect(reports.kiro.integration).toBeUndefined();
    expect(reports.antigravity_cli.integration).toBeUndefined();
    expect(reports.opencode.integration).toBeUndefined();
  });

  it("resolves agent executables from PATH directories containing spaces", async () => {
    const spacedBin = "/Applications/Some App.app/Contents/Resources";
    const codexPath = path.join(spacedBin, HARNESS_RUNTIME_PROFILES.codex.command);
    const { options } = fixture({
      path: [spacedBin, "/usr/local/bin"].join(path.delimiter),
      access: async (target) => {
        if (target === codexPath || target.startsWith("/home/test")) return;
        throw new Error("missing");
      },
    });

    const report = await getAgentReadinessReport("codex", options);

    expect(report.executable).toMatchObject({ command: "codex", path: codexPath, status: "pass" });
  });

  it("parses Pi provider names without returning credential values", async () => {
    const { options } = fixture();

    const report = await getAgentReadinessReport("pi", options);
    const serialized = JSON.stringify(report);

    expect(report.auth).toMatchObject({
      state: "authenticated",
      provider: null,
      availableProviders: ["anthropic", "litellm"],
      status: "pass",
    });
    expect(serialized).not.toContain("access-secret");
    expect(serialized).not.toContain("refresh-secret");
    expect(serialized).not.toContain("litellm-secret");
    expect(serialized).not.toContain("litellm.example.test");
  });

  it("accepts Pi session tracker display names from pi list output", async () => {
    const { options } = fixture({
      runCommand: vi.fn(async (command) => {
        if (command === "pi") return { stdout: "session tracker\n", stderr: "" };
        if (command === "claude") return { stdout: JSON.stringify({ loggedIn: true }), stderr: "" };
        throw new Error(`unexpected command ${command}`);
      }),
    });

    const report = await getAgentReadinessReport("pi", options);

    expect(report.integration).toMatchObject({
      label: "ai-devkit plugin",
      installed: true,
      status: "pass",
    });
  });

  it("reports missing built-in skills as informational readiness", async () => {
    const { options, files } = fixture();
    delete files[path.join(options.homeDir!, skillRoots.codex, "verify", "SKILL.md")];

    const report = await getAgentReadinessReport("codex", options);

    expect(report.builtInSkills).toMatchObject({
      status: "info",
      present: 2,
      required: 3,
      missing: ["verify"],
    });
    expect(report.status).toBe("pass");
  });

  it("checks OpenCode auth from auth list output", async () => {
    const { options } = fixture({
      runCommand: vi.fn(async (command) => {
        if (command === "opencode") {
          return {
            stdout: "\x1B[32m●\x1B[0m  litellm api\n●  OpenAI oauth\n●  GitLab Duo GITLAB_TOKEN\n",
            stderr: "",
          };
        }
        if (command === "pi") return { stdout: "npm:@ai-devkit/pi-session-tracker\n", stderr: "" };
        if (command === "claude") return { stdout: JSON.stringify({ loggedIn: true }), stderr: "" };
        throw new Error(`unexpected command ${command}`);
      }),
    });

    const report = await getAgentReadinessReport("opencode", options);

    expect(report.auth).toMatchObject({
      state: "authenticated",
      source: "opencode auth list",
      provider: null,
      availableProviders: ["GitLab Duo", "OpenAI", "litellm"],
      status: "pass",
    });
  });

  it("checks Copilot auth through GitHub CLI authentication", async () => {
    const { options } = fixture({
      runCommand: vi.fn(async (command) => {
        if (command === "gh")
          return {
            stdout: "github.com\n  Logged in to github.com account test-user\n",
            stderr: "",
          };
        if (command === "pi") return { stdout: "npm:@ai-devkit/pi-session-tracker\n", stderr: "" };
        if (command === "claude") return { stdout: JSON.stringify({ loggedIn: true }), stderr: "" };
        if (command === "opencode") return { stdout: "●  litellm api\n", stderr: "" };
        throw new Error(`unexpected command ${command}`);
      }),
    });

    const report = await getAgentReadinessReport("copilot", options);

    expect(report.auth).toMatchObject({
      state: "authenticated",
      source: "gh auth status --hostname github.com",
      provider: "github",
      availableProviders: ["GitHub"],
      status: "pass",
    });
  });

  it("checks Devin auth from devin auth status output", async () => {
    const { options } = fixture({
      runCommand: vi.fn(async (command) => {
        if (command === "devin")
          return { stdout: "Logged in (via Devin).\n\nUser:\n  Name: test-user\n", stderr: "" };
        if (command === "pi") return { stdout: "npm:@ai-devkit/pi-session-tracker\n", stderr: "" };
        if (command === "claude") return { stdout: JSON.stringify({ loggedIn: true }), stderr: "" };
        throw new Error(`unexpected command ${command}`);
      }),
    });

    const report = await getAgentReadinessReport("devin", options);

    expect(report.auth).toMatchObject({
      state: "authenticated",
      source: "devin auth status",
      provider: null,
      availableProviders: ["devin"],
      status: "pass",
    });
  });

  it("reports Devin as unauthenticated without a login line", async () => {
    const { options } = fixture({
      runCommand: vi.fn(async (command) => {
        if (command === "devin") return { stdout: "Not logged in\n", stderr: "" };
        if (command === "pi") return { stdout: "npm:@ai-devkit/pi-session-tracker\n", stderr: "" };
        if (command === "claude") return { stdout: JSON.stringify({ loggedIn: true }), stderr: "" };
        throw new Error(`unexpected command ${command}`);
      }),
    });

    const report = await getAgentReadinessReport("devin", options);

    expect(report.auth).toMatchObject({ state: "unauthenticated", status: "fail" });
  });
});
