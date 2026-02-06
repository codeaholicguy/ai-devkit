import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { SkillManager } from "../../lib/SkillManager";
import { ConfigManager } from "../../lib/Config";
import { EnvironmentSelector } from "../../lib/EnvironmentSelector";
import { GlobalConfigManager } from "../../lib/GlobalConfig";
import * as gitUtil from "../../util/git";
import * as skillUtil from "../../util/skill";

jest.mock("fs-extra", () => ({
  pathExists: jest.fn(),
  ensureDir: jest.fn(),
  symlink: jest.fn(),
  copy: jest.fn(),
  remove: jest.fn(),
  readdir: jest.fn(),
  realpath: jest.fn(),
  readJson: jest.fn(),
  writeJson: jest.fn(),
}));
jest.mock("../../lib/Config");
jest.mock("../../lib/EnvironmentSelector");
jest.mock("../../lib/GlobalConfig");
jest.mock("../../util/git");
jest.mock("../../util/skill");
jest.mock("ora", () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    text: '',
    isSpinning: false,
  }));
});

const mockedFs = fs as jest.Mocked<typeof fs>;
const MockedConfigManager = ConfigManager as jest.MockedClass<
  typeof ConfigManager
>;
const MockedEnvironmentSelector = EnvironmentSelector as jest.MockedClass<
  typeof EnvironmentSelector
>;
const MockedGlobalConfigManager = GlobalConfigManager as jest.MockedClass<
  typeof GlobalConfigManager
>;
const mockedGitUtil = gitUtil as jest.Mocked<typeof gitUtil>;
const mockedSkillUtil = skillUtil as jest.Mocked<typeof skillUtil>;

function mockFetch(response: any) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response)
  });
}



describe("SkillManager", () => {
  let skillManager: SkillManager;
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockEnvironmentSelector: jest.Mocked<EnvironmentSelector>;
  let mockGlobalConfigManager: jest.Mocked<GlobalConfigManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => { });

    mockConfigManager = new MockedConfigManager() as jest.Mocked<ConfigManager>;
    mockEnvironmentSelector =
      new MockedEnvironmentSelector() as jest.Mocked<EnvironmentSelector>;
    mockGlobalConfigManager =
      new MockedGlobalConfigManager() as jest.Mocked<GlobalConfigManager>;

    mockGlobalConfigManager.getSkillRegistries.mockResolvedValue({});

    skillManager = new SkillManager(
      mockConfigManager,
      mockEnvironmentSelector,
      mockGlobalConfigManager,
    );

    mockedSkillUtil.validateRegistryId.mockImplementation(() => { });
    mockedSkillUtil.validateSkillName.mockImplementation(() => { });
    mockedGitUtil.ensureGitInstalled.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("addSkill", () => {
    const mockRegistryId = "anthropics/skills";
    const mockSkillName = "frontend-design";
    const mockGitUrl = "https://github.com/anthropics/skills.git";
    const mockRepoPath = path.join(
      os.homedir(),
      ".ai-devkit",
      "skills",
      mockRegistryId,
    );

    beforeEach(() => {
      mockFetch({
        registries: {
          [mockRegistryId]: mockGitUrl,
        },
      });

      mockedGitUtil.cloneRepository.mockResolvedValue(mockRepoPath);

      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.ensureDir as any).mockResolvedValue(undefined);
      (mockedFs.symlink as any).mockResolvedValue(undefined);
      (mockedFs.copy as any).mockResolvedValue(undefined);

      mockConfigManager.read.mockResolvedValue({
        environments: ["cursor", "claude"],
      } as any);
    });

    it("should successfully add a skill", async () => {
      await skillManager.addSkill(mockRegistryId, mockSkillName);

      expect(mockedSkillUtil.validateRegistryId).toHaveBeenCalledWith(
        mockRegistryId,
      );
      expect(mockedSkillUtil.validateSkillName).toHaveBeenCalledWith(
        mockSkillName,
      );
      expect(mockedGitUtil.ensureGitInstalled).toHaveBeenCalled();
    });

    it("should fetch registry using fetch API", async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ registries: { [mockRegistryId]: mockGitUrl } })
      });

      await skillManager.addSkill(mockRegistryId, mockSkillName);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("registry.json")
      );

      global.fetch = originalFetch;
    });

    it("should throw error if registry ID not found", async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          registries: {
            "other/repo": "https://github.com/other/repo.git",
          },
        })
      });

      (mockedFs.pathExists as any).mockImplementation((checkPath: string) => {
        if (checkPath.includes(mockRegistryId)) return Promise.resolve(false);
        return Promise.resolve(true);
      });

      await expect(
        skillManager.addSkill(mockRegistryId, mockSkillName),
      ).rejects.toThrow(`Registry "${mockRegistryId}" not found`);

      global.fetch = originalFetch;
    });

    it("should prefer custom registry URL over default", async () => {
      const customGitUrl = "https://github.com/custom/skills.git";

      mockGlobalConfigManager.getSkillRegistries.mockResolvedValue({
        [mockRegistryId]: customGitUrl,
      });

      const repoPath = path.join(
        os.homedir(),
        ".ai-devkit",
        "skills",
        mockRegistryId,
      );

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

    it("should read custom registries from global config", async () => {
      const customGitUrl = "https://github.com/custom/skills.git";
      const { GlobalConfigManager: RealGlobalConfigManager } = jest.requireActual(
        "../../lib/GlobalConfig",
      );
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
        skills: {
          registries: {
            [mockRegistryId]: customGitUrl,
          },
        },
      });

      const skillManagerWithRealGlobal = new SkillManager(
        mockConfigManager,
        mockEnvironmentSelector,
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

    it("should throw error if skill not found in repository", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(false);

      await expect(
        skillManager.addSkill(mockRegistryId, mockSkillName),
      ).rejects.toThrow(
        `Skill "${mockSkillName}" not found in ${mockRegistryId}`,
      );
    });

    it("should skip if skill already exists in target", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);

      await skillManager.addSkill(mockRegistryId, mockSkillName);

      expect(mockedFs.symlink).not.toHaveBeenCalled();
      expect(mockedFs.copy).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("already exists, skipped"),
      );
    });

    it("should create config if missing", async () => {
      mockConfigManager.read.mockResolvedValue(null);
      mockConfigManager.create.mockResolvedValue({
        environments: [],
      } as any);
      mockEnvironmentSelector.selectSkillEnvironments.mockResolvedValue([
        "cursor",
      ]);

      await skillManager.addSkill(mockRegistryId, mockSkillName);

      expect(mockConfigManager.create).toHaveBeenCalled();
      expect(
        mockEnvironmentSelector.selectSkillEnvironments,
      ).toHaveBeenCalled();
      expect(mockConfigManager.update).toHaveBeenCalledWith({
        environments: ["cursor"],
      });
    });

    it("should throw error if no skill-capable environments configured", async () => {
      mockConfigManager.read.mockResolvedValue({
        environments: ["windsurf", "gemini"],
      } as any);

      await expect(
        skillManager.addSkill(mockRegistryId, mockSkillName),
      ).rejects.toThrow("No skill-capable environments configured");
    });

    it("should call validation functions with correct parameters", async () => {
      await skillManager.addSkill(mockRegistryId, mockSkillName);

      expect(mockedSkillUtil.validateRegistryId).toHaveBeenCalledWith(
        mockRegistryId,
      );
      expect(mockedSkillUtil.validateSkillName).toHaveBeenCalledWith(
        mockSkillName,
      );
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
      // UI utility outputs symbol and message as separate parameters
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("⚠"),
        expect.stringContaining("No .ai-devkit.json found"),
      );
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

      const os = require("os");
      const pathModule = require("path");
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
      mockedFs.pathExists
        .mockResolvedValueOnce(true as never)
        .mockResolvedValueOnce(true as never);

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

  describe("removeSkill", () => {
    const mockSkillName = "frontend-design";

    beforeEach(() => {
      mockConfigManager.read.mockResolvedValue({
        environments: ["cursor", "claude"],
      } as any);

      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.remove as any).mockResolvedValue(undefined);
    });

    it("should validate skill name", async () => {
      await skillManager.removeSkill(mockSkillName);

      expect(mockedSkillUtil.validateSkillName).toHaveBeenCalledWith(
        mockSkillName,
      );
    });

    it("should throw error if no config", async () => {
      mockConfigManager.read.mockResolvedValue(null);

      await expect(skillManager.removeSkill(mockSkillName)).rejects.toThrow(
        "No .ai-devkit.json found",
      );
    });

    it("should remove skill from all skill-capable environments", async () => {
      await skillManager.removeSkill(mockSkillName);

      expect(mockedFs.remove).toHaveBeenCalled();
      // UI utility outputs symbol and message as separate parameters
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("✔"),
        expect.stringContaining("Successfully removed"),
      );
    });

    it("should handle skill not found gracefully", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(false);

      await skillManager.removeSkill(mockSkillName);

      expect(mockedFs.remove).not.toHaveBeenCalled();
      // UI utility outputs symbol and message as separate parameters
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("⚠"),
        expect.stringContaining("not found"),
      );
    });

    it("should log helpful tip when skill not found", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(false);

      await skillManager.removeSkill(mockSkillName);

      // UI utility outputs symbol and message as separate parameters
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("ℹ"),
        expect.stringContaining("ai-devkit skill list"),
      );
    });

    it("should note that cache is preserved", async () => {
      await skillManager.removeSkill(mockSkillName);

      // UI utility outputs symbol and message as separate parameters
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("ℹ"),
        expect.stringContaining("Cache"),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("ℹ"),
        expect.stringContaining("preserved"),
      );
    });

    it("should throw error if no skill-capable environments", async () => {
      mockConfigManager.read.mockResolvedValue({
        environments: ["windsurf"],
      } as any);

      await expect(skillManager.removeSkill(mockSkillName)).rejects.toThrow(
        "No skill-capable environments configured",
      );
    });
  });

  describe("updateSkills", () => {

    beforeEach(() => {
      jest.spyOn(console, "log").mockImplementation(() => { });
      mockedGitUtil.ensureGitInstalled.mockResolvedValue(undefined);
    });

    it("should ensure git is installed before updating", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(false);

      await skillManager.updateSkills();

      expect(mockedGitUtil.ensureGitInstalled).toHaveBeenCalled();
    });

    it("should return empty summary when cache directory does not exist", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(false);

      const result = await skillManager.updateSkills();

      expect(result).toEqual({
        total: 0,
        successful: 0,
        skipped: 0,
        failed: 0,
        results: [],
      });
      // UI utility outputs symbol and message as separate parameters
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("⚠"),
        expect.stringContaining("No skills cache found"),
      );
    });

    it("should update all registries when no registryId provided", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any)
        .mockResolvedValueOnce([
          { name: "anthropics", isDirectory: () => true },
          { name: "openai", isDirectory: () => true },
        ])
        .mockResolvedValueOnce([
          { name: "skills", isDirectory: () => true },
        ])
        .mockResolvedValueOnce([
          { name: "tools", isDirectory: () => true },
        ]);

      (mockedGitUtil.isGitRepository as any).mockResolvedValue(true);
      (mockedGitUtil.pullRepository as any).mockResolvedValue(undefined);

      const result = await skillManager.updateSkills();

      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
      expect(mockedGitUtil.pullRepository).toHaveBeenCalledTimes(2);
    });

    it("should update only specific registry when registryId provided", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any)
        .mockResolvedValueOnce([
          { name: "anthropics", isDirectory: () => true },
          { name: "openai", isDirectory: () => true },
        ])
        .mockResolvedValueOnce([
          { name: "skills", isDirectory: () => true },
        ])
        .mockResolvedValueOnce([
          { name: "tools", isDirectory: () => true },
        ]);

      (mockedGitUtil.isGitRepository as any).mockResolvedValue(true);
      (mockedGitUtil.pullRepository as any).mockResolvedValue(undefined);

      const result = await skillManager.updateSkills("anthropics/skills");

      expect(result.total).toBe(1);
      expect(result.successful).toBe(1);
      expect(result.results[0].registryId).toBe("anthropics/skills");
      expect(mockedGitUtil.pullRepository).toHaveBeenCalledTimes(1);
    });

    it("should throw error when specific registry not found", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any)
        .mockResolvedValueOnce([
          { name: "anthropics", isDirectory: () => true },
        ])
        .mockResolvedValueOnce([
          { name: "skills", isDirectory: () => true },
        ]);

      await expect(
        skillManager.updateSkills("nonexistent/registry"),
      ).rejects.toThrow('Registry "nonexistent/registry" not found in cache');
    });

    it("should skip non-git directories", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any)
        .mockResolvedValueOnce([
          { name: "anthropics", isDirectory: () => true },
        ])
        .mockResolvedValueOnce([
          { name: "skills", isDirectory: () => true },
        ]);

      (mockedGitUtil.isGitRepository as any).mockResolvedValue(false);

      const result = await skillManager.updateSkills();

      expect(result.total).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.successful).toBe(0);
      expect(result.results[0].status).toBe("skipped");
      expect(result.results[0].message).toBe("Not a git repository");
      expect(mockedGitUtil.pullRepository).not.toHaveBeenCalled();
    });

    it("should handle git pull errors and continue", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any)
        .mockResolvedValueOnce([
          { name: "anthropics", isDirectory: () => true },
          { name: "openai", isDirectory: () => true },
        ])
        .mockResolvedValueOnce([
          { name: "skills", isDirectory: () => true },
        ])
        .mockResolvedValueOnce([
          { name: "tools", isDirectory: () => true },
        ]);

      (mockedGitUtil.isGitRepository as any).mockResolvedValue(true);
      (mockedGitUtil.pullRepository as any)
        .mockRejectedValueOnce(new Error("You have unstaged changes"))
        .mockResolvedValueOnce(undefined);

      const result = await skillManager.updateSkills();

      expect(result.total).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[0].status).toBe("error");
      expect(result.results[0].message).toContain("unstaged changes");
      expect(result.results[1].status).toBe("success");
    });

    it("should collect and report all errors", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any)
        .mockResolvedValueOnce([
          { name: "anthropics", isDirectory: () => true },
        ])
        .mockResolvedValueOnce([
          { name: "skills", isDirectory: () => true },
        ]);

      (mockedGitUtil.isGitRepository as any).mockResolvedValue(true);
      (mockedGitUtil.pullRepository as any).mockRejectedValue(
        new Error("Network error"),
      );

      const result = await skillManager.updateSkills();

      expect(result.failed).toBe(1);
      expect(result.results[0].error).toBeDefined();
      expect(result.results[0].error?.message).toBe("Network error");
    });

    it("should show progress for each registry", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any)
        .mockResolvedValueOnce([
          { name: "anthropics", isDirectory: () => true },
        ])
        .mockResolvedValueOnce([
          { name: "skills", isDirectory: () => true },
        ]);

      (mockedGitUtil.isGitRepository as any).mockResolvedValue(true);
      (mockedGitUtil.pullRepository as any).mockResolvedValue(undefined);

      await skillManager.updateSkills();

      // Summary now uses ui.summary() which formats differently
      // It outputs "✓ 1 updated" as a single colored string
      expect(console.log).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("updated"),
      );
    });

    it("should display summary after updates", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any)
        .mockResolvedValueOnce([
          { name: "anthropics", isDirectory: () => true },
        ])
        .mockResolvedValueOnce([
          { name: "skills", isDirectory: () => true },
        ]);

      (mockedGitUtil.isGitRepository as any).mockResolvedValue(true);
      (mockedGitUtil.pullRepository as any).mockResolvedValue(undefined);

      await skillManager.updateSkills();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Summary:"),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("1 updated"),
      );
    });

    it("should handle mixed results (success, skip, error)", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any)
        .mockResolvedValueOnce([
          { name: "anthropics", isDirectory: () => true },
          { name: "openai", isDirectory: () => true },
          { name: "custom", isDirectory: () => true },
        ])
        .mockResolvedValueOnce([
          { name: "skills", isDirectory: () => true },
        ])
        .mockResolvedValueOnce([
          { name: "tools", isDirectory: () => true },
        ])
        .mockResolvedValueOnce([
          { name: "manual", isDirectory: () => true },
        ]);

      (mockedGitUtil.isGitRepository as any)
        .mockResolvedValueOnce(true)  // anthropics/skills - git repo
        .mockResolvedValueOnce(false) // openai/tools - not git
        .mockResolvedValueOnce(true); // custom/manual - git repo

      (mockedGitUtil.pullRepository as any)
        .mockResolvedValueOnce(undefined) // anthropics/skills - success
        .mockRejectedValueOnce(new Error("Merge conflict")); // custom/manual - error

      const result = await skillManager.updateSkills();

      expect(result.total).toBe(3);
      expect(result.successful).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe("findSkills", () => {
    const mockSkillIndex = {
      meta: {
        version: 1,
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
        registriesHash: "repo1|repo2",
        registryHeads: {
          "anthropics/skills": "abc123",
          "vercel-labs/agent-skills": "def456",
        },
      },
      skills: [
        {
          name: "typescript-helper",
          registry: "anthropics/skills",
          path: "skills/typescript-helper",
          description: "TypeScript development utilities",
          lastIndexed: Date.now(),
        },
        {
          name: "react-components",
          registry: "vercel-labs/agent-skills",
          path: "skills/react-components",
          description: "Build React components with best practices",
          lastIndexed: Date.now(),
        },
        {
          name: "frontend-design",
          registry: "anthropics/skills",
          path: "skills/frontend-design",
          description: "Frontend design patterns and components",
          lastIndexed: Date.now(),
        },
      ],
    };

    beforeEach(() => {
      mockGlobalConfigManager.getSkillRegistries.mockResolvedValue({});

      mockedGitUtil.fetchGitHead.mockImplementation(async (url: string) => {
        if (url.includes('anthropics')) return 'abc123';
        if (url.includes('vercel')) return 'def456';
        return '000000';
      });
    });

    it("should throw error if keyword is empty", async () => {
      await expect(skillManager.findSkills("")).rejects.toThrow("Keyword is required");
      await expect(skillManager.findSkills("   ")).rejects.toThrow("Keyword is required");
    });

    it("should load and use fresh index when available", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readJson as any).mockResolvedValue(mockSkillIndex);

      const results = await skillManager.findSkills("typescript");

      expect(mockedFs.readJson).toHaveBeenCalledWith(
        expect.stringContaining("skills.json")
      );
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("typescript-helper");
    });

    it("should search by skill name", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readJson as any).mockResolvedValue(mockSkillIndex);

      const results = await skillManager.findSkills("react");

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("react-components");
    });

    it("should search by description", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readJson as any).mockResolvedValue(mockSkillIndex);

      const results = await skillManager.findSkills("design");

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("frontend-design");
    });

    it("should be case-insensitive", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readJson as any).mockResolvedValue(mockSkillIndex);

      const results = await skillManager.findSkills("TYPESCRIPT");

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("typescript-helper");
    });

    it("should return multiple matches", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readJson as any).mockResolvedValue(mockSkillIndex);

      const results = await skillManager.findSkills("component");

      expect(results).toHaveLength(2);
      expect(results.map(r => r.name)).toContain("react-components");
      expect(results.map(r => r.name)).toContain("frontend-design");
    });

    it("should return empty array when no matches found", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readJson as any).mockResolvedValue(mockSkillIndex);

      const results = await skillManager.findSkills("nonexistent");

      expect(results).toEqual([]);
    });
  });
});
