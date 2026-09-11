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
      selectSkillEnvironments: (...args: unknown[]) => mockSelectSkillEnvironments(...args),
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
      listInstallableSkills: (...args: unknown[]) => mockListInstallableSkills(...args),
      listSkills: (...args: unknown[]) => mockListSkills(...args),
      removeSkill: (...args: unknown[]) => mockRemoveSkill(...args),
      removeRegistry: (...args: unknown[]) => mockRemoveRegistry(...args),
      updateSkills: vi.fn(),
      findSkills: vi.fn(),
      rebuildIndex: vi.fn(),
    };
  }),
}));

vi.mock("../../services/skill/skill-builtins.js", () => ({
  BUILTIN_SKILL_REGISTRY: "codeaholicguy/ai-devkit",
  getBuiltinSkillNames: (...args: unknown[]) => mockGetBuiltinSkillNames(...args),
}));

vi.mock("../../util/terminal-ui.js", () => ({
  ui: {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    text: vi.fn(),
    table: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("../../util/terminal.js", () => ({
  isInteractiveTerminal: (...args: unknown[]) => mockIsInteractiveTerminal(...args),
}));

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
        items: [{ skillName, target: `.claude/skills/${skillName}`, action: "symlinked" }],
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

    await program.parseAsync(["node", "test", "skill", "remove-registry", "example/skills"]);

    expect(mockRemoveRegistry).toHaveBeenCalledWith("example/skills", { global: undefined });
    expect(ui.success).toHaveBeenCalledWith('Removed project skill registry "example/skills".');
  });

  it.each(["-g", "--global"])("removes the global registry and its cache with %s", async (flag) => {
    mockRemoveRegistry.mockResolvedValue("global");
    const program = new Command();
    registerSkillCommand(program);
    await program.parseAsync(["node", "test", "skill", "remove-registry", "example/skills", flag]);
    expect(mockRemoveRegistry).toHaveBeenCalledWith("example/skills", { global: true });
    expect(ui.success).toHaveBeenCalledWith('Removed global skill registry "example/skills".');
  });

  it("always protects the built-in registry", async () => {
    mockRemoveRegistry.mockRejectedValue(
      new Error('Registry "codeaholicguy/ai-devkit" is built in and cannot be unregistered.'),
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
    await program.parseAsync(["node", "test", "skill", "remove-registry", "example/skills"]);
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
    await program.parseAsync(["node", "test", "skill", "remove-registry", "x/missing", "--global"]);
    expect(ui.error).toHaveBeenCalledWith(
      "Failed to remove registry: Registry x/missing is not registered (try --global).",
    );
  });

  it("validates removal IDs before reading either scope", async () => {
    mockRemoveRegistry.mockRejectedValue(
      new Error('Invalid registry ID format: "invalid". Expected format: "org/repo"'),
    );
    const program = new Command();
    registerSkillCommand(program);
    await program.parseAsync(["node", "test", "skill", "remove-registry", "invalid"]);
    expect(ui.error).toHaveBeenCalledWith(expect.stringContaining("Invalid registry ID format"));
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

    expect(mockAddRegistry).toHaveBeenCalledWith("anthropics/skills", "same-url", {
      force: undefined,
    });
    expect(ui.info).toHaveBeenCalledWith('Registry "anthropics/skills" is already registered.');
    expect(ui.success).not.toHaveBeenCalled();
  });

  it.each(["-g", "--global"])("routes %s registry writes to global config", async (globalFlag) => {
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

    expect(mockAddRegistry).toHaveBeenCalledWith("example/private-skills", "opaque-url", {
      global: true,
      force: undefined,
    });
  });

  it.each(["-f", "--force"])("forwards %s and reports a forced update", async (forceFlag) => {
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

    expect(mockAddRegistry).toHaveBeenCalledWith("example/private-skills", "new-url", {
      force: true,
    });
    expect(ui.success).toHaveBeenCalledWith('Updated skill registry "example/private-skills".');
  });

  it.each([
    "https://github.com/anthropics/skills.git",
    "https://github.com/anthropics/skills",
    "anything the user provides",
  ])("preserves URL input verbatim: %s", async (url) => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(["node", "test", "skill", "add-registry", "anthropics/skills", url]);

    expect(mockAddRegistry).toHaveBeenCalledWith("anthropics/skills", url, { force: undefined });
  });

  it.each(["bare-slug", "owner/nested/repo", "owner/repo.name"])(
    "rejects invalid registry ID %s",
    async (id) => {
      const program = new Command();
      registerSkillCommand(program);
      mockAddRegistry.mockRejectedValue(
        new Error(`Invalid registry ID format: "${id}". Expected format: "org/repo"`),
      );

      await program.parseAsync(["node", "test", "skill", "add-registry", id, "opaque-url"]);

      expect(ui.error).toHaveBeenCalledWith(expect.stringContaining("Invalid registry ID format"));
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

    const skillCommand = program.commands.find((command) => command.name() === "skill");
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
    expect(skillCommand?.commands.some((command) => command.name() === "list-registries")).toBe(
      false,
    );
  });

  it("prompts for skill add when skill name is omitted", async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(["node", "test", "skill", "add", "anthropics/skills"]);

    expect(mockListInstallableSkills).toHaveBeenCalledWith("anthropics/skills");
    expect(mockCheckbox).toHaveBeenCalledWith({
      message: "Select skill(s) to install",
      choices: [
        { name: "frontend-design - Frontend skill", value: "frontend-design" },
        { name: "debug", value: "debug" },
      ],
      required: true,
    });
    expect(mockAddSkills).toHaveBeenCalledWith("anthropics/skills", ["frontend-design"], {
      global: undefined,
      environments: ["claude"],
    });
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

    expect(mockAddSkill).toHaveBeenCalledWith("anthropics/skills", "frontend-design", {
      global: undefined,
      environments: ["claude"],
    });
    expect(mockListInstallableSkills).not.toHaveBeenCalled();
    expect(mockAddSkills).not.toHaveBeenCalled();
  });

  it("shows a warning instead of exiting when skill selection is cancelled", async () => {
    const error = new Error("User cancelled");
    error.name = "ExitPromptError";
    mockCheckbox.mockRejectedValue(error);

    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(["node", "test", "skill", "add", "anthropics/skills"]);

    expect(ui.warning).toHaveBeenCalledWith("Skill selection cancelled.");
    expect(ui.error).not.toHaveBeenCalled();
    expect(mockAddSkills).not.toHaveBeenCalled();
  });

  it("fails before prompting when skill name is omitted in non-interactive mode", async () => {
    mockIsInteractiveTerminal.mockReturnValue(false);

    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(["node", "test", "skill", "add", "anthropics/skills"]);

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
    expect(mockAddSkill).toHaveBeenCalledWith("codeaholicguy/ai-devkit", "remote-one", {
      global: undefined,
      environments: ["claude"],
    });
    expect(mockAddSkill).toHaveBeenCalledWith("codeaholicguy/ai-devkit", "remote-two", {
      global: undefined,
      environments: ["claude"],
    });
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

    const skillCommand = program.commands.find((command) => command.name() === "skill");
    const addCommand = skillCommand?.commands.find((command) => command.name() === "add");

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

    await program.parseAsync(["node", "test", "skill", "list", "--global", "--env", "claude"]);

    expect(mockListGlobalSkills).toHaveBeenCalledWith(["claude"]);
    expect(ui.table).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: ["Skill Name", "Environments", "Path"],
        rows: [["frontend-design", "claude", "~/.claude/skills/frontend-design"]],
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
    expect(ui.text).toHaveBeenNthCalledWith(1, "Installed Skills:", { breakline: true });
    expect(ui.table).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: ["Skill Name", "Registry", "Environments"],
        rows: [["frontend-design", "anthropics/skills", "cursor, claude"]],
      }),
    );
    expect(ui.text).toHaveBeenNthCalledWith(2, "Total: 1 skill(s)", { breakline: true });
  });

  it("rejects skill list --env unless --global is present", async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(["node", "test", "skill", "list", "--env", "claude"]);

    expect(ui.error).toHaveBeenCalledWith(
      "Failed to list skills: --env can only be used with --global",
    );
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockListGlobalSkills).not.toHaveBeenCalled();
  });

  it("documents global list filtering in command help", () => {
    const program = new Command();
    registerSkillCommand(program);

    const skillCommand = program.commands.find((command) => command.name() === "skill");
    const listCommand = skillCommand?.commands.find((command) => command.name() === "list");

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

    await program.parseAsync(["node", "test", "skill", "remove", "frontend-design"]);

    expect(mockRemoveSkill).toHaveBeenCalledWith("frontend-design", {
      global: undefined,
      environments: undefined,
    });
  });
});
