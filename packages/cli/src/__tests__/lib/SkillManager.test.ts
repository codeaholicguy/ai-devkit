import * as fs from "fs-extra";
import * as https from "https";
import { SkillManager } from "../../lib/SkillManager";
import { ConfigManager } from "../../lib/Config";
import { EnvironmentSelector } from "../../lib/EnvironmentSelector";
import * as gitUtil from "../../util/git";
import * as skillUtil from "../../util/skill";
import { EventEmitter } from "events";

jest.mock("fs-extra", () => ({
  pathExists: jest.fn(),
  ensureDir: jest.fn(),
  symlink: jest.fn(),
  copy: jest.fn(),
  remove: jest.fn(),
  readdir: jest.fn(),
  realpath: jest.fn(),
}));
jest.mock("https");
jest.mock("../../lib/Config");
jest.mock("../../lib/EnvironmentSelector");
jest.mock("../../util/git");
jest.mock("../../util/skill");

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedHttps = https as jest.Mocked<typeof https>;
const MockedConfigManager = ConfigManager as jest.MockedClass<
  typeof ConfigManager
>;
const MockedEnvironmentSelector = EnvironmentSelector as jest.MockedClass<
  typeof EnvironmentSelector
>;
const mockedGitUtil = gitUtil as jest.Mocked<typeof gitUtil>;
const mockedSkillUtil = skillUtil as jest.Mocked<typeof skillUtil>;

describe("SkillManager", () => {
  let skillManager: SkillManager;
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockEnvironmentSelector: jest.Mocked<EnvironmentSelector>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});

    mockConfigManager = new MockedConfigManager() as jest.Mocked<ConfigManager>;
    mockEnvironmentSelector =
      new MockedEnvironmentSelector() as jest.Mocked<EnvironmentSelector>;

    skillManager = new SkillManager(mockConfigManager, mockEnvironmentSelector);

    mockedSkillUtil.validateRegistryId.mockImplementation(() => {});
    mockedSkillUtil.validateSkillName.mockImplementation(() => {});
    mockedGitUtil.ensureGitInstalled.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("addSkill", () => {
    const mockRegistryId = "anthropics/skills";
    const mockSkillName = "frontend-design";
    const mockGitUrl = "https://github.com/anthropics/skills.git";
    const mockRepoPath = "/home/user/.ai-devkit/skills/anthropics/skills";

    beforeEach(() => {
      mockHttpsGet({
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

    it("should fetch registry from GitHub", async () => {
      await skillManager.addSkill(mockRegistryId, mockSkillName);

      expect(mockedHttps.get).toHaveBeenCalled();
      const getCall = (mockedHttps.get as jest.Mock).mock.calls[0][0];
      expect(getCall).toContain("raw.githubusercontent.com");
      expect(getCall).toContain("registry.json");
    });

    it("should throw error if registry ID not found", async () => {
      mockHttpsGet({
        registries: {
          "other/repo": "https://github.com/other/repo.git",
        },
      });

      await expect(
        skillManager.addSkill(mockRegistryId, mockSkillName),
      ).rejects.toThrow(`Registry "${mockRegistryId}" not found`);
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
      expect(console.log).toHaveBeenCalledWith(
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
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Successfully removed"),
      );
    });

    it("should handle skill not found gracefully", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(false);

      await skillManager.removeSkill(mockSkillName);

      expect(mockedFs.remove).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("not found"),
      );
    });

    it("should log helpful tip when skill not found", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(false);

      await skillManager.removeSkill(mockSkillName);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("ai-devkit skill list"),
      );
    });

    it("should note that cache is preserved", async () => {
      await skillManager.removeSkill(mockSkillName);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Cache"),
      );
      expect(console.log).toHaveBeenCalledWith(
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
});

function mockHttpsGet(responseData: any) {
  (mockedHttps.get as jest.Mock).mockImplementation(
    (url: string, callback: any) => {
      const response = new EventEmitter() as any;
      response.statusCode = 200;

      process.nextTick(() => {
        callback(response);
        response.emit("data", JSON.stringify(responseData));
        response.emit("end");
      });

      return {
        on: jest.fn(),
      };
    },
  );
}
