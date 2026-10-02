import { Command } from "commander";

import { registerSkillCommand } from "../../commands/skill/index.js";
import { ui } from "../../util/terminal-ui.js";
import { SkillService } from "../../services/skill/skill.service.js";

const mockGetBuiltinSkillNames = vi.hoisted(() => vi.fn());
const mockIsInteractiveTerminal = vi.hoisted(() => vi.fn(() => true));
const mockCheckbox = vi.hoisted(() => vi.fn());
const mockConfigRead = vi.hoisted(() => vi.fn());
const mockConfigCreate = vi.hoisted(() => vi.fn());
const mockConfigUpdate = vi.hoisted(() => vi.fn());
const mockSelectSkillEnvironments = vi.hoisted(() => vi.fn());
const mockSelectGlobalSkillEnvironments = vi.hoisted(() => vi.fn());

const mockAddSkill = vi.fn();
const mockAddSkills = vi.fn();
const mockAddRegistry = vi.fn();
const mockListGlobalSkills = vi.fn();
const mockListInstallableSkills = vi.fn();
const mockListSkills = vi.fn();
const mockRemoveSkill = vi.fn();
const mockRemoveRegistry = vi.fn();
const mockFindSkills = vi.fn();

vi.mock("../../lib/Config.js", () => ({
  ConfigManager: vi.fn(function () {
    return {
      read: (...args: unknown[]) => mockConfigRead(...args),
      create: (...args: unknown[]) => mockConfigCreate(...args),
      update: (...args: unknown[]) => mockConfigUpdate(...args),
    };
  }),
}));

vi.mock("../../lib/EnvironmentSelector.js", () => ({
  EnvironmentSelector: vi.fn(function () {
    return {
      selectSkillEnvironments: (...args: unknown[]) =>
        mockSelectSkillEnvironments(...args),
      selectGlobalSkillEnvironments: (...args: unknown[]) =>
        mockSelectGlobalSkillEnvironments(...args),
    };
  }),
}));

vi.mock("../../services/skill/skill.service.js", () => ({
  SkillService: vi.fn(function () {
    return {
      addSkill: (...args: unknown[]) => mockAddSkill(...args),
      addSkills: (...args: unknown[]) => mockAddSkills(...args),
      addRegistry: (...args: unknown[]) => mockAddRegistry(...args),
      listGlobalSkills: (...args: unknown[]) => mockListGlobalSkills(...args),
      listInstallableSkills: (...args: unknown[]) =>
        mockListInstallableSkills(...args),
      listSkills: (...args: unknown[]) => mockListSkills(...args),
      removeSkill: (...args: unknown[]) => mockRemoveSkill(...args),
      removeRegistry: (...args: unknown[]) => mockRemoveRegistry(...args),
      updateSkills: vi.fn(),
      findSkills: (...args: unknown[]) => mockFindSkills(...args),
      rebuildIndex: vi.fn(),
    };
  }),
}));

vi.mock("../../services/skill/skill-builtins.js", () => ({
  BUILTIN_SKILL_REGISTRY: "codeaholicguy/ai-devkit",
  getBuiltinSkillNames: (...args: unknown[]) =>
    mockGetBuiltinSkillNames(...args),
}));

vi.mock("../../util/terminal-ui.js", () => ({
  ui: {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    text: vi.fn(),
    table: vi.fn(),
    success: vi.fn(),
    summary: vi.fn(),
  },
}));

vi.mock("../../util/terminal.js", () => ({
  isInteractiveTerminal: (...args: unknown[]) =>
    mockIsInteractiveTerminal(...args),
}));

// ui.text receives chalk-formatted strings; assertions must hold with or
// without color support (piped vs TTY, FORCE_COLOR in CI).
const ANSI_PATTERN =
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
const textCalls = (): string[] =>
  vi.mocked(ui.text).mock.calls.map(([text]) => text.replace(ANSI_PATTERN, ""));

/** A program whose commander errors reject `parseAsync` instead of exiting. */
function strictProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerSkillCommand(program);
  program.commands.forEach((command) => {
    command.exitOverride();
    command.commands.forEach((sub) => sub.exitOverride());
  });
  return program;
}

vi.mock("@inquirer/prompts", () => ({
  checkbox: (...args: unknown[]) => mockCheckbox(...args),
}));

describe("skill command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddSkill.mockImplementation(
      async (
        registryId: string,
        skillName: string,
        options: { global?: boolean; environments?: string[] },
      ) => ({
        status: "installed",
        registryId,
        installMode: options.global ? "global" : "project",
        environments: options.environments || [],
        items: [
          {
            skillName,
            target: `.claude/skills/${skillName}`,
            action: "symlinked",
          },
        ],
      }),
    );
    mockAddSkills.mockImplementation(
      async (
        registryId: string,
        skillNames: string[],
        options: { global?: boolean; environments?: string[] },
      ) => ({
        status: "installed",
        registryId,
        installMode: options.global ? "global" : "project",
        environments: options.environments || [],
        items: skillNames.map((skillName) => ({
          skillName,
          target: `.claude/skills/${skillName}`,
          action: "symlinked",
        })),
      }),
    );
    mockAddRegistry.mockResolvedValue("added");
    mockListGlobalSkills.mockResolvedValue([]);
    mockListInstallableSkills.mockResolvedValue([
      { name: "frontend-design", description: "Frontend skill" },
      { name: "debug" },
    ]);
    mockListSkills.mockResolvedValue([]);
    mockRemoveSkill.mockImplementation(
      async (skillName: string, options: { global?: boolean }) => ({
        skillName,
        scope: options.global ? "global" : "project",
        removedTargets: [],
        failures: [],
      }),
    );
    mockRemoveRegistry.mockResolvedValue("project");
    mockGetBuiltinSkillNames.mockResolvedValue(["remote-one", "remote-two"]);
    mockIsInteractiveTerminal.mockReturnValue(true);
    mockConfigRead.mockResolvedValue({ environments: ["claude"] });
    mockConfigCreate.mockResolvedValue({ environments: [] });
    mockConfigUpdate.mockResolvedValue({});
    mockSelectSkillEnvironments.mockResolvedValue(["claude"]);
    mockSelectGlobalSkillEnvironments.mockResolvedValue(["claude"]);
    mockCheckbox.mockResolvedValue(["frontend-design"]);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as any);
    vi.spyOn(process.stderr, "write").mockImplementation((() => true) as any);
  });

  it("removes a project registry by default and keeps its cache", async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "skill",
      "remove-registry",
      "example/skills",
    ]);

    expect(mockRemoveRegistry).toHaveBeenCalledWith("example/skills", {
      global: undefined,
    });
    expect(ui.success).toHaveBeenCalledWith(
      'Removed project skill registry "example/skills".',
    );
  });

  it.each(["-g", "--global"])(
    "removes the global registry and its cache with %s",
    async (flag) => {
      mockRemoveRegistry.mockResolvedValue("global");
      const program = new Command();
      registerSkillCommand(program);
      await program.parseAsync([
        "node",
        "test",
        "skill",
        "remove-registry",
        "example/skills",
        flag,
      ]);
      expect(mockRemoveRegistry).toHaveBeenCalledWith("example/skills", {
        global: true,
      });
      expect(ui.success).toHaveBeenCalledWith(
        'Removed global skill registry "example/skills".',
      );
    },
  );

  it("always protects the built-in registry", async () => {
    mockRemoveRegistry.mockRejectedValue(
      new Error(
        'Registry "codeaholicguy/ai-devkit" is built in and cannot be unregistered.',
      ),
    );
    const program = new Command();
    registerSkillCommand(program);
    await program.parseAsync([
      "node",
      "test",
      "skill",
      "remove-registry",
      "codeaholicguy/ai-devkit",
    ]);
    expect(ui.error).toHaveBeenCalledWith(
      'Failed to remove registry: Registry "codeaholicguy/ai-devkit" is built in and cannot be unregistered.',
    );
  });

  it("suggests --global when the project registration is missing", async () => {
    mockRemoveRegistry.mockRejectedValue(
      new Error("Registry example/skills is not registered (try --global)."),
    );
    const program = new Command();
    registerSkillCommand(program);
    await program.parseAsync([
      "node",
      "test",
      "skill",
      "remove-registry",
      "example/skills",
    ]);
    expect(ui.error).toHaveBeenCalledWith(
      "Failed to remove registry: Registry example/skills is not registered (try --global).",
    );
  });

  it("reports a missing global registration without reading project config", async () => {
    mockRemoveRegistry.mockRejectedValue(
      new Error("Registry x/missing is not registered (try --global)."),
    );
    const program = new Command();
    registerSkillCommand(program);
    await program.parseAsync([
      "node",
      "test",
      "skill",
      "remove-registry",
      "x/missing",
      "--global",
    ]);
    expect(ui.error).toHaveBeenCalledWith(
      "Failed to remove registry: Registry x/missing is not registered (try --global).",
    );
  });

  it("validates removal IDs before reading either scope", async () => {
    mockRemoveRegistry.mockRejectedValue(
      new Error(
        'Invalid registry ID format: "invalid". Expected format: "org/repo"',
      ),
    );
    const program = new Command();
    registerSkillCommand(program);
    await program.parseAsync([
      "node",
      "test",
      "skill",
      "remove-registry",
      "invalid",
    ]);
    expect(ui.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid registry ID format"),
    );
  });

  it("adds an opaque registry URL to project config by default", async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "skill",
      "add-registry",
      "example/private-skills",
      "git@example.com:example/private-skills.git",
    ]);

    expect(mockAddRegistry).toHaveBeenCalledWith(
      "example/private-skills",
      "git@example.com:example/private-skills.git",
      { force: undefined },
    );
  });

  it("reports an identical target-scope registry as already registered", async () => {
    mockAddRegistry.mockResolvedValue("already-registered");
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "skill",
      "add-registry",
      "anthropics/skills",
      "same-url",
    ]);

    expect(mockAddRegistry).toHaveBeenCalledWith(
      "anthropics/skills",
      "same-url",
      {
        force: undefined,
      },
    );
    expect(ui.info).toHaveBeenCalledWith(
      'Registry "anthropics/skills" is already registered.',
    );
    expect(ui.success).not.toHaveBeenCalled();
  });

  it.each(["-g", "--global"])(
    "routes %s registry writes to global config",
    async (globalFlag) => {
      const program = new Command();
      registerSkillCommand(program);

      await program.parseAsync([
        "node",
        "test",
        "skill",
        "add-registry",
        "example/private-skills",
        "opaque-url",
        globalFlag,
      ]);

      expect(mockAddRegistry).toHaveBeenCalledWith(
        "example/private-skills",
        "opaque-url",
        {
          global: true,
          force: undefined,
        },
      );
    },
  );

  it.each(["-f", "--force"])(
    "forwards %s and reports a forced update",
    async (forceFlag) => {
      mockAddRegistry.mockResolvedValue("updated");
      const program = new Command();
      registerSkillCommand(program);

      await program.parseAsync([
        "node",
        "test",
        "skill",
        "add-registry",
        "example/private-skills",
        "new-url",
        forceFlag,
      ]);

      expect(mockAddRegistry).toHaveBeenCalledWith(
        "example/private-skills",
        "new-url",
        {
          force: true,
        },
      );
      expect(ui.success).toHaveBeenCalledWith(
        'Updated skill registry "example/private-skills".',
      );
    },
  );

  it.each([
    "https://github.com/anthropics/skills.git",
    "https://github.com/anthropics/skills",
    "anything the user provides",
  ])("preserves URL input verbatim: %s", async (url) => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "skill",
      "add-registry",
      "anthropics/skills",
      url,
    ]);

    expect(mockAddRegistry).toHaveBeenCalledWith("anthropics/skills", url, {
      force: undefined,
    });
  });

  it.each(["bare-slug", "owner/nested/repo", "owner/repo.name"])(
    "rejects invalid registry ID %s",
    async (id) => {
      const program = new Command();
      registerSkillCommand(program);
      mockAddRegistry.mockRejectedValue(
        new Error(
          `Invalid registry ID format: "${id}". Expected format: "org/repo"`,
        ),
      );

      await program.parseAsync([
        "node",
        "test",
        "skill",
        "add-registry",
        id,
        "opaque-url",
      ]);

      expect(ui.error).toHaveBeenCalledWith(
        expect.stringContaining("Invalid registry ID format"),
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    },
  );

  it("rejects a target-scope conflict without calling the setter", async () => {
    mockAddRegistry.mockRejectedValue(
      new Error(
        'Registry "example/private-skills" is already registered with a different URL. Use --force to overwrite it.',
      ),
    );
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "skill",
      "add-registry",
      "example/private-skills",
      "new-url",
    ]);

    expect(ui.error).toHaveBeenCalledWith(
      'Failed to add registry: Registry "example/private-skills" is already registered with a different URL. Use --force to overwrite it.',
    );
  });

  it("documents add-registry arguments and scope/conflict flags", () => {
    const program = new Command();
    registerSkillCommand(program);

    const skillCommand = program.commands.find(
      (command) => command.name() === "skill",
    );
    const addRegistryCommand = skillCommand?.commands.find(
      (command) => command.name() === "add-registry",
    );

    expect(addRegistryCommand?.usage()).toContain("<id>");
    expect(addRegistryCommand?.usage()).toContain("<source>");
    expect(addRegistryCommand?.helpInformation()).toContain("-g, --global");
    expect(addRegistryCommand?.helpInformation()).toContain("-f, --force");
    const removeRegistryCommand = skillCommand?.commands.find(
      (command) => command.name() === "remove-registry",
    );
    expect(removeRegistryCommand?.usage()).toContain("<id>");
    expect(removeRegistryCommand?.helpInformation()).toContain("-g, --global");
    expect(removeRegistryCommand?.helpInformation()).not.toContain("purge");
    expect(
      skillCommand?.commands.some(
        (command) => command.name() === "list-registries",
      ),
    ).toBe(false);
  });

  it("prompts for skill add when skill name is omitted", async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "skill",
      "add",
      "anthropics/skills",
    ]);

    expect(mockListInstallableSkills).toHaveBeenCalledWith("anthropics/skills");
    expect(mockCheckbox).toHaveBeenCalledWith({
      message: "Select skill(s) to install",
      choices: [
        { name: "frontend-design - Frontend skill", value: "frontend-design" },
        { name: "debug", value: "debug" },
      ],
      required: true,
    });
    expect(mockAddSkills).toHaveBeenCalledWith(
      "anthropics/skills",
      ["frontend-design"],
      {
        global: undefined,
        environments: ["claude"],
      },
    );
    expect(mockAddSkill).not.toHaveBeenCalled();
    expect(process.stderr.write).not.toHaveBeenCalled();
  });

  it("parses skill add with explicit skill name and forwards both args", async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "skill",
      "add",
      "anthropics/skills",
      "frontend-design",
    ]);

    expect(mockAddSkill).toHaveBeenCalledWith(
      "anthropics/skills",
      "frontend-design",
      {
        global: undefined,
        environments: ["claude"],
      },
    );
    expect(mockListInstallableSkills).not.toHaveBeenCalled();
    expect(mockAddSkills).not.toHaveBeenCalled();
  });

  it.each(["copy", "link"])("forwards skill add --mode %s to the installer", async (mode) => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "skill",
      "add",
      "anthropics/skills",
      "frontend-design",
      "--mode",
      mode,
    ]);

    expect(mockAddSkill).toHaveBeenCalledWith("anthropics/skills", "frontend-design", {
      global: undefined,
      environments: ["claude"],
      mode,
    });
  });

  it("applies --mode to every built-in skill", async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(["node", "test", "skill", "add", "--built-in", "--mode", "copy"]);

    expect(mockAddSkill).toHaveBeenCalledTimes(2);
    for (const call of mockAddSkill.mock.calls) {
      expect(call[2]).toMatchObject({ mode: "copy" });
    }
  });

  it("rejects an unknown --mode before installing anything", async () => {
    await expect(
      strictProgram().parseAsync([
        "node",
        "test",
        "skill",
        "add",
        "anthropics/skills",
        "frontend-design",
        "--mode",
        "hardlink",
      ]),
    ).rejects.toThrow(/Allowed choices are copy, link/);
    expect(mockAddSkill).not.toHaveBeenCalled();
  });

  it("documents the --mode choices in skill add help", () => {
    const program = new Command();
    registerSkillCommand(program);

    const addCommand = program.commands
      .find((command) => command.name() === "skill")
      ?.commands.find((command) => command.name() === "add");

    const help = addCommand?.helpInformation().replace(/\s+/g, " ");
    expect(help).toContain("--mode <mode>");
    expect(help).toContain('(choices: "copy", "link")');
  });

  describe("skill find", () => {
    const entry = (name: string, registry: string) => ({
      name,
      registry,
      path: `skills/${name}`,
      description: "A skill",
      lastIndexed: 0,
    });
    const manyResults = Array.from({ length: 25 }, (_, index) =>
      entry(`skill-${String(index + 1).padStart(2, "0")}`, "example/skills"),
    );
    const commands = () => textCalls().filter((line) => line.includes("ai-devkit skill add"));
    const tableRows = () => vi.mocked(ui.table).mock.calls[0]?.[0].rows ?? [];
    const runFind = async (results: unknown[], keyword: string, ...args: string[]) => {
      mockFindSkills.mockResolvedValue(results);
      const program = new Command();
      registerSkillCommand(program);
      await program.parseAsync(["node", "test", "skill", "find", keyword, ...args]);
    };

    it("lists the exact skill add command for each result", async () => {
      await runFind(
        [entry("frontend-design", "anthropics/skills"), entry("debug", "codeaholicguy/ai-devkit")],
        "design",
      );

      const lines = textCalls();
      const header = lines.findIndex((line) => line.trim() === "Install with:");
      expect(header).toBeGreaterThan(-1);
      expect(lines.slice(header + 1, header + 3)).toEqual([
        "  ai-devkit skill add anthropics/skills frontend-design",
        "  ai-devkit skill add codeaholicguy/ai-devkit debug",
      ]);
      expect(lines.join("\n")).not.toContain("<registry>");
    });

    it("prints no install commands when there are no results", async () => {
      await runFind([], "nothing");

      expect(ui.warning).toHaveBeenCalledWith('No skills found matching "nothing"');
      expect(commands()).toEqual([]);
    });

    it("shows the top 10 results with their commands and says how to see the rest", async () => {
      await runFind(manyResults, "skill");

      expect(tableRows()).toHaveLength(10);
      expect(commands()).toHaveLength(10);
      expect(commands()[0]).toBe("  ai-devkit skill add example/skills skill-01");
      expect(textCalls()).toContainEqual(
        expect.stringContaining('Found 25 skills matching "skill" (showing top 10)'),
      );
      expect(textCalls()).toContainEqual(
        expect.stringContaining("15 more. Narrow the keyword, or use --limit <n> or --all"),
      );
    });

    it("shows the requested number of results with --limit", async () => {
      await runFind(manyResults, "skill", "--limit", "3");

      expect(tableRows()).toHaveLength(3);
      expect(commands()).toHaveLength(3);
      expect(textCalls()).toContainEqual(expect.stringContaining("22 more."));
    });

    it("shows every result with --all and no footer", async () => {
      await runFind(manyResults, "skill", "--all");

      expect(tableRows()).toHaveLength(25);
      expect(commands()).toHaveLength(25);
      expect(textCalls().some((line) => line.includes("more."))).toBe(false);
      expect(textCalls()).toContainEqual('Found 25 skills matching "skill":');
    });

    it("rejects a --limit that is not a positive integer", async () => {
      await expect(
        strictProgram().parseAsync(["node", "test", "skill", "find", "skill", "--limit", "0"]),
      ).rejects.toThrow(/positive integer/);
      expect(mockFindSkills).not.toHaveBeenCalled();
    });
  });

  it("renders skill add results with per-target lines and dim metadata", async () => {
    mockAddSkill.mockResolvedValue({
      status: "installed",
      registryId: "anthropics/skills",
      installMode: "global",
      environments: ["claude", "codex"],
      items: [
        {
          skillName: "frontend-design",
          target: "~/.claude/skills/frontend-design/SKILL.md",
          action: "symlinked",
        },
        {
          skillName: "frontend-design",
          target: "~/.codex/skills/frontend-design/SKILL.md",
          action: "skipped",
        },
      ],
    });
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "skill",
      "add",
      "anthropics/skills",
      "frontend-design",
      "--global",
      "--env",
      "claude",
      "codex",
    ]);

    expect(ui.success).toHaveBeenCalledWith(
      "Installed frontend-design from anthropics/skills",
    );
    expect(textCalls()[0]).toBe("  Source: anthropics/skills");
    expect(textCalls()[1]).toBe("  Installed to (global): claude, codex");
    expect(textCalls()[2]).toBe(
      "✔ ~/.claude/skills/frontend-design/SKILL.md — symlinked",
    );
    expect(textCalls()[3]).toBe(
      "⚠ ~/.codex/skills/frontend-design/SKILL.md — already exists, skipped",
    );
    expect(ui.info).not.toHaveBeenCalledWith(
      expect.stringContaining("Source:"),
    );
  });

  it("shows a warning instead of exiting when skill selection is cancelled", async () => {
    const error = new Error("User cancelled");
    error.name = "ExitPromptError";
    mockCheckbox.mockRejectedValue(error);

    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "skill",
      "add",
      "anthropics/skills",
    ]);

    expect(ui.warning).toHaveBeenCalledWith("Skill selection cancelled.");
    expect(ui.error).not.toHaveBeenCalled();
    expect(mockAddSkills).not.toHaveBeenCalled();
  });

  it("fails before prompting when skill name is omitted in non-interactive mode", async () => {
    mockIsInteractiveTerminal.mockReturnValue(false);

    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "skill",
      "add",
      "anthropics/skills",
    ]);

    expect(ui.error).toHaveBeenCalledWith(
      "Failed to add skill: Skill name is required in non-interactive mode. Re-run with: ai-devkit skill add <registry> <skill-name>",
    );
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockListInstallableSkills).not.toHaveBeenCalled();
    expect(mockCheckbox).not.toHaveBeenCalled();
    expect(mockAddSkills).not.toHaveBeenCalled();
  });

  it("installs all built-in skills with skill add --built-in", async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(["node", "test", "skill", "add", "--built-in"]);

    expect(mockAddSkill).toHaveBeenCalledTimes(2);
    expect(mockAddSkill).toHaveBeenCalledWith(
      "codeaholicguy/ai-devkit",
      "remote-one",
      {
        global: undefined,
        environments: ["claude"],
      },
    );
    expect(mockAddSkill).toHaveBeenCalledWith(
      "codeaholicguy/ai-devkit",
      "remote-two",
      {
        global: undefined,
        environments: ["claude"],
      },
    );
    expect(mockGetBuiltinSkillNames).toHaveBeenCalledOnce();
    expect(SkillService).toHaveBeenCalledTimes(1);
  });

  it("exits when skill add has neither registry nor --built-in", async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(["node", "test", "skill", "add"]);

    expect(ui.error).toHaveBeenCalledWith(
      "Missing registry. Use: ai-devkit skill add <registry>/<repo> [skill-name] or ai-devkit skill add --built-in",
    );
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockAddSkill).not.toHaveBeenCalled();
  });

  it("registers the add command with an optional skill-name argument", () => {
    const program = new Command();
    registerSkillCommand(program);

    const skillCommand = program.commands.find(
      (command) => command.name() === "skill",
    );
    const addCommand = skillCommand?.commands.find(
      (command) => command.name() === "add",
    );

    expect(addCommand?.usage()).toContain("[registry-repo]");
    expect(addCommand?.usage()).toContain("[skill-name]");
  });

  it("lists global skills for selected environments with provenance", async () => {
    mockListGlobalSkills.mockResolvedValue([
      {
        name: "frontend-design",
        environments: ["claude"],
        path: "~/.claude/skills/frontend-design",
      },
    ]);
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "skill",
      "list",
      "--global",
      "--env",
      "claude",
    ]);

    expect(mockListGlobalSkills).toHaveBeenCalledWith(["claude"]);
    expect(ui.table).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: ["Skill Name", "Environments", "Path"],
        rows: [
          ["frontend-design", "claude", "~/.claude/skills/frontend-design"],
        ],
      }),
    );
  });

  it("preserves project-local list behavior when --global is absent", async () => {
    mockListSkills.mockResolvedValue([
      {
        name: "frontend-design",
        registry: "anthropics/skills",
        environments: ["cursor", "claude"],
      },
    ]);
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(["node", "test", "skill", "list"]);

    expect(mockListSkills).toHaveBeenCalledOnce();
    expect(mockListGlobalSkills).not.toHaveBeenCalled();
    expect(ui.text).toHaveBeenNthCalledWith(1, "Installed Skills:", {
      breakline: true,
    });
    expect(ui.table).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: ["Skill Name", "Registry", "Environments"],
        rows: [["frontend-design", "anthropics/skills", "cursor, claude"]],
      }),
    );
    expect(ui.text).toHaveBeenNthCalledWith(2, "Total: 1 skill", {
      breakline: true,
    });
  });

  it("rejects skill list --env unless --global is present", async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "skill",
      "list",
      "--env",
      "claude",
    ]);

    expect(ui.error).toHaveBeenCalledWith(
      "Failed to list skills: --env can only be used with --global",
    );
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockListGlobalSkills).not.toHaveBeenCalled();
  });

  it("documents global list filtering in command help", () => {
    const program = new Command();
    registerSkillCommand(program);

    const skillCommand = program.commands.find(
      (command) => command.name() === "skill",
    );
    const listCommand = skillCommand?.commands.find(
      (command) => command.name() === "list",
    );

    expect(listCommand?.helpInformation()).toContain("--global");
    expect(listCommand?.helpInformation()).toContain("--env <environment...>");
    expect(listCommand?.helpInformation()).toMatch(/requires\s+--global/);
  });

  it("forwards global removal options to the skill manager", async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "skill",
      "remove",
      "frontend-design",
      "--global",
      "--env",
      "claude",
      "codex",
    ]);

    expect(mockRemoveSkill).toHaveBeenCalledWith("frontend-design", {
      global: true,
      environments: ["claude", "codex"],
    });
  });

  it("preserves project removal options when global flags are absent", async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "skill",
      "remove",
      "frontend-design",
    ]);

    expect(mockRemoveSkill).toHaveBeenCalledWith("frontend-design", {
      global: undefined,
      environments: undefined,
    });
  });

  it("renders skill remove results with per-target lines and pluralized metadata", async () => {
    mockRemoveSkill.mockResolvedValue({
      skillName: "frontend-design",
      scope: "project",
      removedTargets: [
        "/workspace/.claude/skills/frontend-design",
        "/workspace/.codex/skills/frontend-design",
      ],
      failures: [],
    });
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync([
      "node",
      "test",
      "skill",
      "remove",
      "frontend-design",
    ]);

    expect(ui.success).toHaveBeenCalledWith(
      "Removed frontend-design from 2 locations",
    );
    expect(textCalls()[0]).toBe(
      "  Note: Cached copy in ~/.ai-devkit/skills/ preserved for other projects.",
    );
    expect(textCalls()[1]).toBe(
      "✔ /workspace/.claude/skills/frontend-design — removed",
    );
    expect(textCalls()[2]).toBe(
      "✔ /workspace/.codex/skills/frontend-design — removed",
    );
  });
});
