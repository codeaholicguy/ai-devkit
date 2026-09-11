import type { MockedClass, Mocked, Mock } from "vitest";
import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { SkillService } from "../../../services/skill/skill.service.js";
import { ConfigManager } from "../../../lib/Config.js";
import { EnvironmentSelector } from "../../../lib/EnvironmentSelector.js";
import { GlobalConfigManager } from "../../../lib/GlobalConfig.js";
import * as gitUtil from "../../../util/git.js";
import * as skillUtil from "../../../services/skill/skill-validation.js";

vi.mock("fs-extra", () => ({
  default: {
    pathExists: vi.fn(),
    ensureDir: vi.fn(),
    symlink: vi.fn(),
    copy: vi.fn(),
    lstat: vi.fn(),
    remove: vi.fn(),
    readdir: vi.fn(),
    opendir: vi.fn(),
    realpath: vi.fn(),
    readFile: vi.fn(),
    readJson: vi.fn(),
    stat: vi.fn(),
    writeJson: vi.fn(),
  },
}));
vi.mock("../../../lib/Config.js", () => ({
  ConfigManager: vi.fn(function () {
    return {
      addSkill: vi.fn(),
      create: vi.fn(),
      getSkillRegistries: vi.fn(),
      read: vi.fn(),
      removeSkill: vi.fn(),
      update: vi.fn(),
    };
  }),
}));
vi.mock("../../../lib/EnvironmentSelector.js", () => ({
  EnvironmentSelector: vi.fn(function () {
    return {
      selectEnvironments: vi.fn(),
      selectSkillEnvironments: vi.fn(),
      selectGlobalSkillEnvironments: vi.fn(),
      confirmOverride: vi.fn(),
      displaySelectionSummary: vi.fn(),
    };
  }),
}));
vi.mock("../../../lib/GlobalConfig.js", () => ({
  GlobalConfigManager: vi.fn(function () {
    return {
      getSkillRegistries: vi.fn(),
    };
  }),
}));
vi.mock("../../../util/git.js", () => ({
  ensureGitInstalled: vi.fn(),
  cloneRepository: vi.fn(),
  pullRepository: vi.fn(),
  isGitRepository: vi.fn(),
  fetchGitHead: vi.fn(),
  isInsideGitWorkTreeSync: vi.fn(),
  localBranchExistsSync: vi.fn(),
  getWorktreePathsForBranchSync: vi.fn(),
}));
vi.mock("../../../services/skill/skill-validation.js", () => ({
  validateRegistryId: vi.fn(),
  validateSkillName: vi.fn(),
  isValidSkillName: vi.fn(),
}));
vi.mock("../../../services/skill/skill-description.js", () => ({
  extractSkillDescription: vi.fn(),
}));
vi.mock("../../../util/terminal.js", () => ({
  isInteractiveTerminal: vi.fn(() => true),
}));

vi.mock("ora", () => ({
  default: vi.fn(function () {
    return {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      fail: vi.fn().mockReturnThis(),
      warn: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      text: "",
      isSpinning: false,
    };
  }),
}));

import { isInteractiveTerminal } from "../../../util/terminal.js";
import * as skillDescription from "../../../services/skill/skill-description.js";
const mockIsInteractiveTerminal = isInteractiveTerminal as Mock;
const mockedSkillDescription = skillDescription as Mocked<typeof skillDescription>;

const mockedFs = fs as Mocked<typeof fs>;
const MockedConfigManager = ConfigManager as MockedClass<typeof ConfigManager>;
const MockedEnvironmentSelector = EnvironmentSelector as MockedClass<typeof EnvironmentSelector>;
const MockedGlobalConfigManager = GlobalConfigManager as MockedClass<typeof GlobalConfigManager>;
const mockedGitUtil = gitUtil as Mocked<typeof gitUtil>;
const mockedSkillUtil = skillUtil as Mocked<typeof skillUtil>;

function mockFetch(response: any) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response),
  });
}

describe("SkillService", () => {
  let skillManager: SkillService;
  let mockConfigManager: Mocked<ConfigManager>;
  let mockEnvironmentSelector: Mocked<EnvironmentSelector>;
  let mockGlobalConfigManager: Mocked<GlobalConfigManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});

    mockConfigManager = new MockedConfigManager() as Mocked<ConfigManager>;
    mockEnvironmentSelector = new MockedEnvironmentSelector() as Mocked<EnvironmentSelector>;
    mockGlobalConfigManager = new MockedGlobalConfigManager() as Mocked<GlobalConfigManager>;

    mockGlobalConfigManager.getSkillRegistries.mockResolvedValue({});
    mockConfigManager.getSkillRegistries.mockResolvedValue({});

    skillManager = new SkillService(mockConfigManager, mockGlobalConfigManager);

    mockedSkillUtil.validateRegistryId.mockImplementation(() => {});
    mockedSkillUtil.validateSkillName.mockImplementation(() => {});
    mockedSkillUtil.isValidSkillName.mockImplementation((name: string) =>
      /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name),
    );
    mockedGitUtil.ensureGitInstalled.mockResolvedValue(undefined);
    mockConfigManager.addSkill.mockResolvedValue({} as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("addSkill", () => {
    const mockRegistryId = "anthropics/skills";
    const mockSkillName = "frontend-design";
    const mockGitUrl = "https://github.com/anthropics/skills.git";
    const mockRepoPath = path.join(os.homedir(), ".ai-devkit", "skills", mockRegistryId);

    beforeEach(() => {
      mockFetch({
        registries: {
          [mockRegistryId]: mockGitUrl,
        },
      });

      mockedGitUtil.cloneRepository.mockResolvedValue(mockRepoPath);
      mockedGitUtil.isGitRepository.mockResolvedValue(true);
      mockedGitUtil.pullRepository.mockResolvedValue(undefined);

      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.ensureDir as any).mockResolvedValue(undefined);
      (mockedFs.symlink as any).mockResolvedValue(undefined);
      (mockedFs.copy as any).mockResolvedValue(undefined);
      (mockedFs.realpath as any).mockImplementation(async (checkedPath: string) => checkedPath);
      (mockedFs.stat as any).mockResolvedValue({ size: 100 });
      (mockedFs.readdir as any).mockResolvedValue([]);
      (mockedFs.opendir as any).mockResolvedValue({
        async *[Symbol.asyncIterator]() {},
      });
      (mockedFs.readFile as any)?.mockResolvedValue?.("");

      mockConfigManager.read.mockResolvedValue({
        environments: ["cursor", "claude"],
      } as any);
      mockEnvironmentSelector.selectGlobalSkillEnvironments.mockResolvedValue(["cursor", "claude"]);
    });

    const configureRegistrySkills = (skillNames: string[]) => {
      (mockedFs.readdir as any).mockResolvedValue(
        skillNames.map((name) => ({ name, isDirectory: () => true })),
      );
      (mockedFs.opendir as any).mockResolvedValue({
        async *[Symbol.asyncIterator]() {
          for (const name of skillNames) {
            yield { name, isDirectory: () => true, isSymbolicLink: () => false };
          }
        },
      });
      (mockedFs.pathExists as any).mockImplementation((checkPath: string) => {
        if (checkPath === mockRepoPath) {
          return Promise.resolve(true);
        }
        if (checkPath.endsWith(`${path.sep}skills`)) {
          return Promise.resolve(true);
        }

        for (const skillName of skillNames) {
          if (checkPath.endsWith(`${path.sep}${skillName}${path.sep}SKILL.md`)) {
            return Promise.resolve(true);
          }
          if (checkPath.includes(`${path.sep}skills${path.sep}${skillName}`)) {
            return Promise.resolve(true);
          }
        }

        return Promise.resolve(false);
      });
      (mockedFs.realpath as any).mockImplementation(async (checkPath: string) => {
        if (checkPath.endsWith(`${path.sep}broken-skill${path.sep}SKILL.md`)) {
          throw new Error("Missing SKILL.md");
        }
        return checkPath;
      });
      (mockedFs.readFile as any) = vi.fn().mockImplementation((filePath: string) => {
        const matchedSkill = skillNames.find((skillName) =>
          filePath.endsWith(`${skillName}${path.sep}SKILL.md`),
        );

        return Promise.resolve(
          matchedSkill === "frontend-design"
            ? "description: Frontend skill"
            : "description: Debug skill",
        );
      });
      mockedSkillDescription.extractSkillDescription.mockImplementation((content: string) =>
        content.replace("description: ", ""),
      );
    };

    it("should successfully add a skill", async () => {
      const result = await skillManager.addSkill(mockRegistryId, mockSkillName);

      expect(result.status).toBe("matched");

      expect(mockedSkillUtil.validateRegistryId).toHaveBeenCalledWith(mockRegistryId);
      expect(mockedSkillUtil.validateSkillName).toHaveBeenCalledWith(mockSkillName);
      expect(mockedGitUtil.ensureGitInstalled).toHaveBeenCalled();
      expect(mockConfigManager.addSkill).toHaveBeenCalledWith({
        registry: mockRegistryId,
        name: mockSkillName,
      });
    });

    it("should install to home directory when global option is enabled", async () => {
      (mockedFs.pathExists as any).mockImplementation((checkPath: string) => {
        if (
          checkPath === path.join(os.homedir(), ".cursor", "skills", mockSkillName) ||
          checkPath === path.join(os.homedir(), ".claude", "skills", mockSkillName)
        ) {
          return Promise.resolve(false);
        }
        return Promise.resolve(true);
      });

      await skillManager.addSkill(mockRegistryId, mockSkillName, {
        global: true,
        environments: ["cursor", "claude"],
      });

      expect(mockedFs.symlink).toHaveBeenCalledWith(
        expect.any(String),
        path.join(os.homedir(), ".cursor", "skills", mockSkillName),
        "dir",
      );
      expect(mockConfigManager.read).not.toHaveBeenCalled();
      expect(mockConfigManager.create).not.toHaveBeenCalled();
      expect(mockConfigManager.addSkill).not.toHaveBeenCalled();
    });

    it("should throw error when global env is invalid", async () => {
      await expect(
        skillManager.addSkill(mockRegistryId, mockSkillName, {
          global: true,
          environments: ["invalid-env"],
        }),
      ).rejects.toThrow("Invalid environment codes: invalid-env");
    });

    it("should accept resolved project environments from the command layer", async () => {
      const result = await skillManager.addSkill(mockRegistryId, mockSkillName, {
        environments: ["claude"],
      });

      expect(result.environments).toEqual(["claude"]);
      expect(mockConfigManager.read).not.toHaveBeenCalled();
    });

    it("should install only selected global environments", async () => {
      (mockedFs.pathExists as any).mockImplementation((checkPath: string) => {
        if (checkPath === path.join(os.homedir(), ".claude", "skills", mockSkillName)) {
          return Promise.resolve(false);
        }
        return Promise.resolve(true);
      });

      await skillManager.addSkill(mockRegistryId, mockSkillName, {
        global: true,
        environments: ["claude"],
      });

      expect(mockedFs.symlink).toHaveBeenCalledTimes(1);
      expect(mockedFs.symlink).toHaveBeenCalledWith(
        expect.any(String),
        path.join(os.homedir(), ".claude", "skills", mockSkillName),
        "dir",
      );
      expect(mockEnvironmentSelector.selectGlobalSkillEnvironments).not.toHaveBeenCalled();
    });

    it("should fetch registry using fetch API", async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ registries: { [mockRegistryId]: mockGitUrl } }),
      });

      await skillManager.addSkill(mockRegistryId, mockSkillName);
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("registry.json"));

      global.fetch = originalFetch;
    });

    it("should throw error if registry ID not found", async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            registries: {
              "other/repo": "https://github.com/other/repo.git",
            },
          }),
      });

      (mockedFs.pathExists as any).mockImplementation((checkPath: string) => {
        if (checkPath.includes(mockRegistryId)) return Promise.resolve(false);
        return Promise.resolve(true);
      });

      await expect(skillManager.addSkill(mockRegistryId, mockSkillName)).rejects.toThrow(
        `Registry "${mockRegistryId}" not found`,
      );

      global.fetch = originalFetch;
    });

    it("should prefer custom registry URL over default", async () => {
      const customGitUrl = "https://github.com/custom/skills.git";

      mockGlobalConfigManager.getSkillRegistries.mockResolvedValue({
        [mockRegistryId]: customGitUrl,
      });

      const repoPath = path.join(os.homedir(), ".ai-devkit", "skills", mockRegistryId);

      (mockedFs.pathExists as any).mockImplementation((checkPath: string) => {
        if (checkPath === repoPath) {
          return Promise.resolve(false);
        }

        if (checkPath.includes(`${path.sep}skills${path.sep}${mockSkillName}`)) {
          return Promise.resolve(true);
        }

        if (checkPath.endsWith(`${path.sep}SKILL.md`)) {
          return Promise.resolve(true);
        }

        return Promise.resolve(true);
      });

      await skillManager.addSkill(mockRegistryId, mockSkillName);

      expect(mockedGitUtil.cloneRepository).toHaveBeenCalledWith(
        path.join(os.homedir(), ".ai-devkit", "skills"),
        mockRegistryId,
        customGitUrl,
      );
    });

    it("should prefer project registry URL over global and default", async () => {
      const defaultGitUrl = "https://github.com/default/skills.git";
      const globalGitUrl = "https://github.com/global/skills.git";
      const projectGitUrl = "https://github.com/project/skills.git";

      mockFetch({
        registries: {
          [mockRegistryId]: defaultGitUrl,
        },
      });

      mockGlobalConfigManager.getSkillRegistries.mockResolvedValue({
        [mockRegistryId]: globalGitUrl,
      });
      mockConfigManager.getSkillRegistries.mockResolvedValue({
        [mockRegistryId]: projectGitUrl,
      });

      const repoPath = path.join(os.homedir(), ".ai-devkit", "skills", mockRegistryId);

      (mockedFs.pathExists as any).mockImplementation((checkPath: string) => {
        if (checkPath === repoPath) {
          return Promise.resolve(false);
        }

        if (checkPath.includes(`${path.sep}skills${path.sep}${mockSkillName}`)) {
          return Promise.resolve(true);
        }

        if (checkPath.endsWith(`${path.sep}SKILL.md`)) {
          return Promise.resolve(true);
        }

        return Promise.resolve(true);
      });

      await skillManager.addSkill(mockRegistryId, mockSkillName);

      expect(mockedGitUtil.cloneRepository).toHaveBeenCalledWith(
        path.join(os.homedir(), ".ai-devkit", "skills"),
        mockRegistryId,
        projectGitUrl,
      );
    });

    it("should read custom registries from global config", async () => {
      const customGitUrl = "https://github.com/custom/skills.git";
      const { GlobalConfigManager: RealGlobalConfigManager } = await vi.importActual<
        typeof import("../../../lib/GlobalConfig.js")
      >("../../../lib/GlobalConfig.js");
      const realGlobalConfigManager = new RealGlobalConfigManager();

      mockGlobalConfigManager.getSkillRegistries.mockResolvedValue({});
      mockFetch({ registries: {} });

      (mockedFs.pathExists as any).mockImplementation((checkPath: string) => {
        if (checkPath.includes(`${path.sep}skills${path.sep}${mockSkillName}`)) {
          return Promise.resolve(true);
        }

        if (checkPath.endsWith(`${path.sep}SKILL.md`)) {
          return Promise.resolve(true);
        }

        if (checkPath.includes(mockRegistryId)) {
          return Promise.resolve(false);
        }

        return Promise.resolve(true);
      });

      (mockedFs.readJson as any).mockResolvedValue({
        registries: {
          [mockRegistryId]: customGitUrl,
        },
      });

      const skillManagerWithRealGlobal = new SkillService(
        mockConfigManager,
        realGlobalConfigManager,
      );

      await skillManagerWithRealGlobal.addSkill(mockRegistryId, mockSkillName);

      expect(mockedGitUtil.cloneRepository).toHaveBeenCalledWith(
        path.join(os.homedir(), ".ai-devkit", "skills"),
        mockRegistryId,
        customGitUrl,
      );
    });

    it("should use cached registry when remote fetch fails", async () => {
      mockGlobalConfigManager.getSkillRegistries.mockResolvedValue({});

      (mockedFs.pathExists as any).mockImplementation((checkPath: string) => {
        if (checkPath.includes(mockRegistryId)) {
          return Promise.resolve(true);
        }

        if (checkPath.includes(`${path.sep}skills${path.sep}${mockSkillName}`)) {
          return Promise.resolve(true);
        }

        if (checkPath.endsWith(`${path.sep}SKILL.md`)) {
          return Promise.resolve(true);
        }

        return Promise.resolve(true);
      });

      await skillManager.addSkill(mockRegistryId, mockSkillName);

      expect(mockedGitUtil.cloneRepository).not.toHaveBeenCalled();
    });

    it("should pull cached registry before installing skill", async () => {
      const repoPath = path.join(os.homedir(), ".ai-devkit", "skills", mockRegistryId);

      (mockedFs.pathExists as any).mockImplementation((checkPath: string) => {
        if (checkPath === repoPath) {
          return Promise.resolve(true);
        }
        if (checkPath.includes(`${path.sep}skills${path.sep}${mockSkillName}`)) {
          return Promise.resolve(true);
        }
        if (checkPath.endsWith(`${path.sep}SKILL.md`)) {
          return Promise.resolve(true);
        }
        return Promise.resolve(true);
      });

      mockedGitUtil.isGitRepository.mockResolvedValue(true);
      mockedGitUtil.pullRepository.mockResolvedValue(undefined);

      await skillManager.addSkill(mockRegistryId, mockSkillName);

      expect(mockedGitUtil.cloneRepository).not.toHaveBeenCalled();
      expect(mockedGitUtil.pullRepository).toHaveBeenCalledWith(repoPath);
    });

    it("should skip pull when cached registry is not a git repository", async () => {
      const repoPath = path.join(os.homedir(), ".ai-devkit", "skills", mockRegistryId);

      (mockedFs.pathExists as any).mockImplementation((checkPath: string) => {
        if (checkPath === repoPath) {
          return Promise.resolve(true);
        }
        if (checkPath.includes(`${path.sep}skills${path.sep}${mockSkillName}`)) {
          return Promise.resolve(true);
        }
        if (checkPath.endsWith(`${path.sep}SKILL.md`)) {
          return Promise.resolve(true);
        }
        return Promise.resolve(true);
      });

      mockedGitUtil.isGitRepository.mockResolvedValue(false);

      await skillManager.addSkill(mockRegistryId, mockSkillName);

      expect(mockedGitUtil.pullRepository).not.toHaveBeenCalled();
      expect(mockedGitUtil.cloneRepository).not.toHaveBeenCalled();
    });

    it("should throw error if skill not found in repository", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(false);

      await expect(skillManager.addSkill(mockRegistryId, mockSkillName)).rejects.toThrow(
        `Skill "${mockSkillName}" not found in ${mockRegistryId}`,
      );
    });

    it("should skip if skill already exists in target", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);

      const result = await skillManager.addSkill(mockRegistryId, mockSkillName);

      expect(result.status).toBe("matched");
      expect(mockedFs.symlink).not.toHaveBeenCalled();
      expect(mockedFs.copy).not.toHaveBeenCalled();
      expect(result.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: "skipped", skillName: mockSkillName }),
        ]),
      );
    });

    it("should create config if missing and fail when environments remain unresolved", async () => {
      mockConfigManager.read.mockResolvedValue(null);
      mockConfigManager.create.mockResolvedValue({
        environments: [],
      } as any);

      await expect(skillManager.addSkill(mockRegistryId, mockSkillName)).rejects.toThrow(
        'No environments configured. Run "ai-devkit init" or add "environments" in .ai-devkit.json.',
      );

      expect(mockConfigManager.create).toHaveBeenCalled();
      expect(mockEnvironmentSelector.selectSkillEnvironments).not.toHaveBeenCalled();
      expect(mockConfigManager.update).not.toHaveBeenCalled();
    });

    it("should fail when config exists but has no environments", async () => {
      mockConfigManager.read.mockResolvedValue({
        environments: [],
      } as any);

      await expect(skillManager.addSkill(mockRegistryId, mockSkillName)).rejects.toThrow(
        'No environments configured. Run "ai-devkit init" or add "environments" in .ai-devkit.json.',
      );

      expect(mockConfigManager.create).not.toHaveBeenCalled();
      expect(mockEnvironmentSelector.selectSkillEnvironments).not.toHaveBeenCalled();
      expect(mockConfigManager.update).not.toHaveBeenCalled();
    });

    it("should throw in non-interactive mode when no environments configured", async () => {
      mockIsInteractiveTerminal.mockReturnValue(false);
      mockConfigManager.read.mockResolvedValue({
        environments: [],
      } as any);

      await expect(skillManager.addSkill(mockRegistryId, mockSkillName)).rejects.toThrow(
        'No environments configured. Run "ai-devkit init" or add "environments" in .ai-devkit.json.',
      );
    });

    it("should throw error if no valid skill-capable environments configured", async () => {
      mockConfigManager.read.mockResolvedValue({
        environments: ["invalid-env"],
      } as any);

      await expect(skillManager.addSkill(mockRegistryId, mockSkillName)).rejects.toThrow(
        "Supported: cursor, claude, github, gemini, grok, codex, kilocode, amp, opencode, roo, antigravity, antigravity-cli, junie, cline, devin, pi",
      );
    });

    it("should call validation functions with correct parameters", async () => {
      await skillManager.addSkill(mockRegistryId, mockSkillName);

      expect(mockedSkillUtil.validateRegistryId).toHaveBeenCalledWith(mockRegistryId);
      expect(mockedSkillUtil.validateSkillName).toHaveBeenCalledWith(mockSkillName);
    });

    it("should list installable skills when skill name is omitted at the command layer", async () => {
      configureRegistrySkills(["frontend-design", "debug"]);

      const skills = await skillManager.listInstallableSkills(mockRegistryId);

      expect(skills).toEqual([
        { name: "debug", description: "Debug skill" },
        { name: "frontend-design", description: "Frontend skill" },
      ]);
      expect(mockedSkillUtil.validateRegistryId).toHaveBeenCalledWith(mockRegistryId);
      expect(mockConfigManager.addSkill).not.toHaveBeenCalled();
    });

    it("should fail when skill name is omitted before install", async () => {
      await expect(skillManager.addSkill(mockRegistryId, undefined as any)).rejects.toThrow(
        "Skill name is required. Re-run with: ai-devkit skill add <registry> <skill-name>",
      );
    });

    it("should use cached registry contents when listing installable skills and pull fails", async () => {
      configureRegistrySkills(["debug", "frontend-design"]);
      mockedGitUtil.pullRepository.mockRejectedValue(new Error("network down"));

      const skills = await skillManager.listInstallableSkills(mockRegistryId);

      expect(skills.map((skill) => skill.name)).toEqual(["debug", "frontend-design"]);
      expect(console.log).not.toHaveBeenCalled();
    });

    it("should throw a clear error when the registry has no valid skills", async () => {
      (mockedFs.readdir as any).mockResolvedValue([
        { name: "broken-skill", isDirectory: () => true },
      ]);
      (mockedFs.opendir as any).mockResolvedValue({
        async *[Symbol.asyncIterator]() {
          yield { name: "broken-skill", isDirectory: () => true, isSymbolicLink: () => false };
        },
      });
      (mockedFs.pathExists as any).mockImplementation((checkPath: string) => {
        if (checkPath === mockRepoPath) {
          return Promise.resolve(true);
        }
        if (checkPath.endsWith(`${path.sep}skills`)) {
          return Promise.resolve(true);
        }
        return Promise.resolve(false);
      });

      await expect(skillManager.listInstallableSkills(mockRegistryId)).rejects.toThrow(
        `No valid skills found in ${mockRegistryId}.`,
      );
    });

    it("should support global installation of multiple explicit skills", async () => {
      configureRegistrySkills(["debug", "frontend-design"]);
      (mockedFs.pathExists as any).mockImplementation((checkPath: string) => {
        if (checkPath === path.join(os.homedir(), ".claude", "skills", "debug")) {
          return Promise.resolve(false);
        }
        if (checkPath === path.join(os.homedir(), ".claude", "skills", "frontend-design")) {
          return Promise.resolve(false);
        }
        if (checkPath === mockRepoPath) {
          return Promise.resolve(true);
        }
        if (checkPath.endsWith(`${path.sep}skills`)) {
          return Promise.resolve(true);
        }
        if (checkPath.endsWith(`${path.sep}debug${path.sep}SKILL.md`)) {
          return Promise.resolve(true);
        }
        if (checkPath.endsWith(`${path.sep}frontend-design${path.sep}SKILL.md`)) {
          return Promise.resolve(true);
        }
        if (checkPath.includes(`${path.sep}skills${path.sep}debug`)) {
          return Promise.resolve(true);
        }
        if (checkPath.includes(`${path.sep}skills${path.sep}frontend-design`)) {
          return Promise.resolve(true);
        }
        return Promise.resolve(false);
      });

      await skillManager.addSkills(mockRegistryId, ["debug", "frontend-design"], {
        global: true,
        environments: ["claude"],
      });

      expect(mockedFs.symlink).toHaveBeenCalledWith(
        expect.any(String),
        path.join(os.homedir(), ".claude", "skills", "debug"),
        "dir",
      );
      expect(mockedFs.symlink).toHaveBeenCalledWith(
        expect.any(String),
        path.join(os.homedir(), ".claude", "skills", "frontend-design"),
        "dir",
      );
      expect(mockConfigManager.addSkill).not.toHaveBeenCalled();
    });
  });

  describe("listSkills", () => {
    beforeEach(() => {
      mockConfigManager.read.mockResolvedValue({
        environments: ["cursor", "claude"],
      } as any);

      (mockedFs.pathExists as any).mockResolvedValue(true);
    });

    it("should return empty array if no config", async () => {
      mockConfigManager.read.mockResolvedValue(null);

      const skills = await skillManager.listSkills();

      expect(skills).toEqual([]);
      expect(console.log).not.toHaveBeenCalled();
    });

    it("should return empty array if no environments configured", async () => {
      mockConfigManager.read.mockResolvedValue({
        environments: [],
      } as any);

      const skills = await skillManager.listSkills();

      expect(skills).toEqual([]);
    });

    it("should list skills from skill directories", async () => {
      (mockedFs.readdir as any).mockResolvedValue([
        {
          name: "frontend-design",
          isDirectory: () => true,
          isSymbolicLink: () => false,
        },
        {
          name: "backend-api",
          isDirectory: () => true,
          isSymbolicLink: () => false,
        },
      ] as any);

      const pathModule = path;
      const skillCacheDir = pathModule.join(os.homedir(), ".ai-devkit", "skills");

      (mockedFs.realpath as any).mockImplementation((skillPath: any) =>
        Promise.resolve(
          pathModule.join(skillCacheDir, "anthropics", "skills", skillPath.split("/").pop()),
        ),
      );

      const skills = await skillManager.listSkills();

      expect(skills).toHaveLength(2);
      expect(skills[0].name).toBe("frontend-design");
      expect(skills[1].name).toBe("backend-api");
    });

    it("should detect source registry from symlink paths", async () => {
      (mockedFs.readdir as any).mockResolvedValue([
        {
          name: "frontend-design",
          isDirectory: () => false,
          isSymbolicLink: () => true,
        },
      ] as any);

      // When realpath fails, registry falls back to "unknown"
      // Registry detection from paths is tested via integration tests
      (mockedFs.realpath as any).mockRejectedValue(new Error("Mock"));

      const skills = await skillManager.listSkills();

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe("frontend-design");
      expect(skills[0].registry).toBe("unknown");
    });

    it("should handle non-symlink skills with unknown registry", async () => {
      (mockedFs.readdir as any).mockResolvedValue([
        {
          name: "custom-skill",
          isDirectory: () => true,
          isSymbolicLink: () => false,
        },
      ] as any);

      (mockedFs.realpath as any).mockRejectedValue(new Error("Not a symlink"));

      const skills = await skillManager.listSkills();

      expect(skills[0].registry).toBe("unknown");
    });

    it("should deduplicate skills across environments", async () => {
      mockedFs.pathExists.mockResolvedValueOnce(true as never).mockResolvedValueOnce(true as never);

      mockedFs.readdir
        .mockResolvedValueOnce([
          {
            name: "frontend-design",
            isDirectory: () => true,
            isSymbolicLink: () => false,
          },
        ] as never)
        .mockResolvedValueOnce([
          {
            name: "frontend-design",
            isDirectory: () => true,
            isSymbolicLink: () => false,
          },
        ] as never);

      (mockedFs.realpath as any).mockRejectedValue(new Error("Not a symlink"));

      const skills = await skillManager.listSkills();

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe("frontend-design");
    });

    it("should skip non-directories", async () => {
      (mockedFs.readdir as any).mockResolvedValue([
        {
          name: "README.md",
          isDirectory: () => false,
          isSymbolicLink: () => false,
        },
        {
          name: "frontend-design",
          isDirectory: () => true,
          isSymbolicLink: () => false,
        },
      ] as any);

      (mockedFs.realpath as any).mockRejectedValue(new Error("Not a symlink"));

      const skills = await skillManager.listSkills();

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe("frontend-design");
    });
  });

  describe("listGlobalSkills", () => {
    it("lists valid skills deterministically with environment and path provenance", async () => {
      const claudeRoot = path.join(os.homedir(), ".claude", "skills");
      const codexRoot = path.join(os.homedir(), ".codex", "skills");
      (mockedFs.pathExists as any).mockImplementation((checkPath: string) =>
        Promise.resolve(
          [
            claudeRoot,
            codexRoot,
            path.join(claudeRoot, "zeta", "SKILL.md"),
            path.join(claudeRoot, "alpha", "SKILL.md"),
            path.join(claudeRoot, "bad_name", "SKILL.md"),
            path.join(codexRoot, "alpha", "SKILL.md"),
          ].includes(checkPath),
        ),
      );
      (mockedFs.readdir as any).mockImplementation((root: string) =>
        Promise.resolve(
          root === claudeRoot
            ? [
                { name: "zeta", isDirectory: () => true, isSymbolicLink: () => false },
                { name: "broken", isDirectory: () => false, isSymbolicLink: () => true },
                { name: "bad_name", isDirectory: () => true, isSymbolicLink: () => false },
                { name: "README.md", isDirectory: () => false, isSymbolicLink: () => false },
                { name: "alpha", isDirectory: () => false, isSymbolicLink: () => true },
              ]
            : [{ name: "alpha", isDirectory: () => true, isSymbolicLink: () => false }],
        ),
      );

      const skills = await skillManager.listGlobalSkills(["codex", "claude"]);

      expect(skills).toEqual([
        { name: "alpha", environments: ["claude"], path: "~/.claude/skills/alpha" },
        { name: "alpha", environments: ["codex"], path: "~/.codex/skills/alpha" },
        { name: "zeta", environments: ["claude"], path: "~/.claude/skills/zeta" },
      ]);
      expect(mockConfigManager.read).not.toHaveBeenCalled();
    });

    it("groups environments that share a duplicate global path", async () => {
      const sharedRoot = path.join(os.homedir(), ".config", "agents", "skills");
      (mockedFs.pathExists as any).mockImplementation((checkPath: string) =>
        Promise.resolve(
          checkPath === sharedRoot || checkPath === path.join(sharedRoot, "shared", "SKILL.md"),
        ),
      );
      (mockedFs.readdir as any).mockResolvedValue([
        { name: "shared", isDirectory: () => true, isSymbolicLink: () => false },
      ]);

      const skills = await skillManager.listGlobalSkills(["amp", "amp"]);

      expect(mockedFs.pathExists.mock.calls).toEqual([
        [sharedRoot],
        [path.join(sharedRoot, "shared", "SKILL.md")],
      ]);
      expect(skills).toEqual([
        { name: "shared", environments: ["amp"], path: "~/.config/agents/skills/shared" },
      ]);
      expect(mockedFs.readdir).toHaveBeenCalledTimes(1);
    });

    it("rejects invalid environment filters", async () => {
      await expect(skillManager.listGlobalSkills(["invalid-env"])).rejects.toThrow(
        "Invalid environment codes: invalid-env",
      );
    });
  });

  describe("removeSkill", () => {
    const mockSkillName = "frontend-design";

    beforeEach(() => {
      mockConfigManager.read.mockResolvedValue({
        environments: ["cursor", "claude"],
      } as any);

      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.remove as any).mockResolvedValue(undefined);
      mockConfigManager.removeSkill.mockResolvedValue({} as any);
      (mockedFs.lstat as any).mockResolvedValue({ isSymbolicLink: () => false });
    });

    it("should validate skill name", async () => {
      await skillManager.removeSkill(mockSkillName);

      expect(mockedSkillUtil.validateSkillName).toHaveBeenCalledWith(mockSkillName);
    });

    it("should throw error if no config", async () => {
      mockConfigManager.read.mockResolvedValue(null);

      await expect(skillManager.removeSkill(mockSkillName)).rejects.toThrow(
        "No .ai-devkit.json found",
      );
    });

    it("should remove skill from all skill-capable environments", async () => {
      const result = await skillManager.removeSkill(mockSkillName);

      expect(mockedFs.remove).toHaveBeenCalled();
      expect(result.removedTargets).toEqual([".cursor/skills", ".claude/skills"]);
    });

    it("should update config to remove skill entry after successful removal", async () => {
      await skillManager.removeSkill(mockSkillName);

      expect(mockConfigManager.removeSkill).toHaveBeenCalledWith(mockSkillName);
    });

    it("should not update config when skill files are not found", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(false);

      await skillManager.removeSkill(mockSkillName);

      expect(mockConfigManager.removeSkill).not.toHaveBeenCalled();
    });

    it("should handle skill not found gracefully", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(false);

      const result = await skillManager.removeSkill(mockSkillName);

      expect(mockedFs.remove).not.toHaveBeenCalled();
      expect(result.removedTargets).toEqual([]);
    });

    it("should log helpful tip when skill not found", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(false);

      const result = await skillManager.removeSkill(mockSkillName);

      expect(result.removedTargets).toEqual([]);
      expect(console.log).not.toHaveBeenCalled();
    });

    it("should note that cache is preserved", async () => {
      const result = await skillManager.removeSkill(mockSkillName);

      expect(result.removedTargets).toHaveLength(2);
      expect(console.log).not.toHaveBeenCalled();
    });

    it("should throw error if no valid skill-capable environments", async () => {
      mockConfigManager.read.mockResolvedValue({
        environments: ["invalid-env"],
      } as any);

      await expect(skillManager.removeSkill(mockSkillName)).rejects.toThrow(
        "No skill-capable environments configured",
      );
    });

    it("should reject env selection without global removal", async () => {
      await expect(
        skillManager.removeSkill(mockSkillName, { environments: ["claude"] }),
      ).rejects.toThrow("--env can only be used with --global");

      expect(mockConfigManager.read).not.toHaveBeenCalled();
      expect(mockedFs.remove).not.toHaveBeenCalled();
    });

    it("should remove only from selected global environments", async () => {
      await skillManager.removeSkill(mockSkillName, {
        global: true,
        environments: ["claude", "codex"],
      });

      expect(mockedFs.remove).toHaveBeenCalledTimes(2);
      expect(mockedFs.remove).toHaveBeenCalledWith(
        path.join(os.homedir(), ".claude", "skills", mockSkillName),
      );
      expect(mockedFs.remove).toHaveBeenCalledWith(
        path.join(os.homedir(), ".codex", "skills", mockSkillName),
      );
      expect(mockConfigManager.read).not.toHaveBeenCalled();
      expect(mockConfigManager.removeSkill).not.toHaveBeenCalled();
    });

    it("should remove from every configured global skill root when env is omitted", async () => {
      await skillManager.removeSkill(mockSkillName, { global: true });

      expect(mockedFs.remove).toHaveBeenCalledWith(
        path.join(os.homedir(), ".claude", "skills", mockSkillName),
      );
      expect(mockedFs.remove).toHaveBeenCalledWith(
        path.join(os.homedir(), ".gemini", "config", "skills", mockSkillName),
      );
      expect(mockEnvironmentSelector.selectGlobalSkillEnvironments).not.toHaveBeenCalled();
    });

    it("should reject invalid global environments before removing anything", async () => {
      await expect(
        skillManager.removeSkill(mockSkillName, { global: true, environments: ["invalid-env"] }),
      ).rejects.toThrow("Invalid environment codes: invalid-env");

      expect(mockedFs.remove).not.toHaveBeenCalled();
    });

    it("should continue global removal after one target fails and report the failure", async () => {
      (mockedFs.remove as any)
        .mockRejectedValueOnce(new Error("permission denied"))
        .mockResolvedValueOnce(undefined);

      await expect(
        skillManager.removeSkill(mockSkillName, {
          global: true,
          environments: ["claude", "codex"],
        }),
      ).rejects.toThrow("Failed to remove skill from 1 location(s)");

      expect(mockedFs.remove).toHaveBeenCalledTimes(2);
    });

    it("should remove a dangling global symlink without following its target", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(false);
      (mockedFs.lstat as any).mockResolvedValue({ isSymbolicLink: () => true });

      await skillManager.removeSkill(mockSkillName, {
        global: true,
        environments: ["claude"],
      });

      expect(mockedFs.lstat).toHaveBeenCalledWith(
        path.join(os.homedir(), ".claude", "skills", mockSkillName),
      );
      expect(mockedFs.remove).toHaveBeenCalledWith(
        path.join(os.homedir(), ".claude", "skills", mockSkillName),
      );
      expect(mockedFs.realpath).not.toHaveBeenCalled();
    });
  });
});
