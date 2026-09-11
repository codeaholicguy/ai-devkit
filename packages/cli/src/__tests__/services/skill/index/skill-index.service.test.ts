import type { MockedClass, Mocked } from "vitest";
import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { SkillService } from "../../../../services/skill/skill.service.js";
import { ConfigManager } from "../../../../lib/Config.js";
import { GlobalConfigManager } from "../../../../lib/GlobalConfig.js";
import * as gitUtil from "../../../../util/git.js";
import * as skillUtil from "../../../../services/skill/skill-validation.js";

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
vi.mock("../../../../lib/Config.js", () => ({
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
vi.mock("../../../../lib/GlobalConfig.js", () => ({
  GlobalConfigManager: vi.fn(function () {
    return {
      getSkillRegistries: vi.fn(),
    };
  }),
}));
vi.mock("../../../../util/git.js", () => ({
  ensureGitInstalled: vi.fn(),
  cloneRepository: vi.fn(),
  pullRepository: vi.fn(),
  isGitRepository: vi.fn(),
  fetchGitHead: vi.fn(),
  isInsideGitWorkTreeSync: vi.fn(),
  localBranchExistsSync: vi.fn(),
  getWorktreePathsForBranchSync: vi.fn(),
}));
vi.mock("../../../../services/skill/skill-validation.js", () => ({
  validateRegistryId: vi.fn(),
  validateSkillName: vi.fn(),
  isValidSkillName: vi.fn(),
}));
vi.mock("../../../../services/skill/skill-description.js", () => ({
  extractSkillDescription: vi.fn(),
}));
vi.mock("../../../../util/terminal.js", () => ({
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

import * as skillDescription from "../../../../services/skill/skill-description.js";
const mockedSkillDescription = skillDescription as Mocked<typeof skillDescription>;

const mockedFs = fs as Mocked<typeof fs>;
const MockedConfigManager = ConfigManager as MockedClass<typeof ConfigManager>;
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
  let mockGlobalConfigManager: Mocked<GlobalConfigManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});

    mockConfigManager = new MockedConfigManager() as Mocked<ConfigManager>;
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
    (mockedFs.realpath as any).mockImplementation(async (checkedPath: string) => checkedPath);
    (mockedFs.stat as any).mockResolvedValue({ size: 100 });
    (mockedFs.opendir as any).mockResolvedValue({
      async *[Symbol.asyncIterator]() {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("updateSkills", () => {
    beforeEach(() => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      mockedGitUtil.ensureGitInstalled.mockResolvedValue(undefined);
    });

    it("does not require git when there is no cached git registry to update", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(false);

      await skillManager.updateSkills();

      expect(mockedGitUtil.ensureGitInstalled).not.toHaveBeenCalled();
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
      expect(console.log).not.toHaveBeenCalled();
    });

    it("should update all registries when no registryId provided", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any)
        .mockResolvedValueOnce([
          { name: "anthropics", isDirectory: () => true },
          { name: "openai", isDirectory: () => true },
        ])
        .mockResolvedValueOnce([{ name: "skills", isDirectory: () => true }])
        .mockResolvedValueOnce([{ name: "tools", isDirectory: () => true }]);

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
        .mockResolvedValueOnce([{ name: "skills", isDirectory: () => true }])
        .mockResolvedValueOnce([{ name: "tools", isDirectory: () => true }]);

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
        .mockResolvedValueOnce([{ name: "anthropics", isDirectory: () => true }])
        .mockResolvedValueOnce([{ name: "skills", isDirectory: () => true }]);

      await expect(skillManager.updateSkills("nonexistent/registry")).rejects.toThrow(
        'Registry "nonexistent/registry" not found in cache',
      );
    });

    it("should skip non-git directories", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any)
        .mockResolvedValueOnce([{ name: "anthropics", isDirectory: () => true }])
        .mockResolvedValueOnce([{ name: "skills", isDirectory: () => true }]);

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
        .mockResolvedValueOnce([{ name: "skills", isDirectory: () => true }])
        .mockResolvedValueOnce([{ name: "tools", isDirectory: () => true }]);

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
        .mockResolvedValueOnce([{ name: "anthropics", isDirectory: () => true }])
        .mockResolvedValueOnce([{ name: "skills", isDirectory: () => true }]);

      (mockedGitUtil.isGitRepository as any).mockResolvedValue(true);
      (mockedGitUtil.pullRepository as any).mockRejectedValue(new Error("Network error"));

      const result = await skillManager.updateSkills();

      expect(result.failed).toBe(1);
      expect(result.results[0].error).toBeDefined();
      expect(result.results[0].error?.message).toBe("Network error");
    });

    it("should show progress for each registry", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any)
        .mockResolvedValueOnce([{ name: "anthropics", isDirectory: () => true }])
        .mockResolvedValueOnce([{ name: "skills", isDirectory: () => true }]);

      (mockedGitUtil.isGitRepository as any).mockResolvedValue(true);
      (mockedGitUtil.pullRepository as any).mockResolvedValue(undefined);

      const result = await skillManager.updateSkills();

      expect(result.successful).toBe(1);
      expect(console.log).not.toHaveBeenCalled();
    });

    it("should display summary after updates", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any)
        .mockResolvedValueOnce([{ name: "anthropics", isDirectory: () => true }])
        .mockResolvedValueOnce([{ name: "skills", isDirectory: () => true }]);

      (mockedGitUtil.isGitRepository as any).mockResolvedValue(true);
      (mockedGitUtil.pullRepository as any).mockResolvedValue(undefined);

      const result = await skillManager.updateSkills();

      expect(result).toMatchObject({
        successful: 1,
        skipped: 0,
        failed: 0,
      });
      expect(console.log).not.toHaveBeenCalled();
    });

    it("should handle mixed results (success, skip, error)", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readdir as any)
        .mockResolvedValueOnce([
          { name: "anthropics", isDirectory: () => true },
          { name: "openai", isDirectory: () => true },
          { name: "custom", isDirectory: () => true },
        ])
        .mockResolvedValueOnce([{ name: "skills", isDirectory: () => true }])
        .mockResolvedValueOnce([{ name: "tools", isDirectory: () => true }])
        .mockResolvedValueOnce([{ name: "manual", isDirectory: () => true }]);

      (mockedGitUtil.isGitRepository as any)
        .mockResolvedValueOnce(true) // anthropics/skills - git repo
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
        if (url.includes("anthropics")) return "abc123";
        if (url.includes("vercel")) return "def456";
        return "000000";
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

      expect(mockedFs.readJson).toHaveBeenCalledWith(expect.stringContaining("skills.json"));
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
      expect(results.map((r) => r.name)).toContain("react-components");
      expect(results.map((r) => r.name)).toContain("frontend-design");
    });

    it("should return empty array when no matches found", async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readJson as any).mockResolvedValue(mockSkillIndex);

      const results = await skillManager.findSkills("nonexistent");

      expect(results).toEqual([]);
    });

    it("indexes configured non-GitHub registries from matching local cache on refresh", async () => {
      mockFetch({ registries: {} });
      mockGlobalConfigManager.getSkillRegistries.mockResolvedValue({
        "example/private-skills": "git@example.com:example/private-skills.git",
      });
      mockConfigManager.getSkillRegistries.mockResolvedValue({});
      mockedGitUtil.fetchGitHead.mockResolvedValue("unused");
      mockedSkillDescription.extractSkillDescription.mockReturnValue("ASF experiment workflow");

      const expectedRegistryPath = path.join(
        os.homedir(),
        ".ai-devkit",
        "skills",
        "example",
        "private-skills",
      );
      const unrelatedRegistryPath = path.join(
        os.homedir(),
        ".ai-devkit",
        "skills",
        "unrelated",
        "skills",
      );

      (mockedFs.pathExists as any).mockImplementation(async (checkedPath: string) => {
        return (
          checkedPath === expectedRegistryPath ||
          checkedPath === path.join(expectedRegistryPath, "skills") ||
          checkedPath === path.join(expectedRegistryPath, "skills", "asf", "SKILL.md") ||
          checkedPath.endsWith("skills.json")
        );
      });
      (mockedFs.readJson as any).mockResolvedValue({
        meta: {
          version: 1,
          createdAt: Date.now() - 1000,
          updatedAt: Date.now() - 1000,
          registryHeads: {},
        },
        skills: [
          {
            name: "unrelated-skill",
            registry: "unrelated/skills",
            path: "skills/unrelated-skill",
            description: "Should not be indexed",
            lastIndexed: Date.now(),
          },
        ],
      });
      (mockedFs.readdir as any).mockImplementation(async (checkedPath: string) => {
        if (checkedPath === path.join(expectedRegistryPath, "skills")) {
          return [{ name: "asf", isDirectory: () => true }];
        }
        if (checkedPath === path.join(unrelatedRegistryPath, "skills")) {
          return [{ name: "unrelated-skill", isDirectory: () => true }];
        }
        return [];
      });
      (mockedFs.realpath as any).mockImplementation(async (checkedPath: string) => checkedPath);
      (mockedFs.opendir as any).mockImplementation(async (checkedPath: string) => ({
        async *[Symbol.asyncIterator]() {
          if (checkedPath === path.join(expectedRegistryPath, "skills")) {
            yield { name: "asf", isDirectory: () => true, isSymbolicLink: () => false };
          }
          if (checkedPath === path.join(unrelatedRegistryPath, "skills")) {
            yield { name: "unrelated-skill", isDirectory: () => true, isSymbolicLink: () => false };
          }
        },
      }));
      (mockedFs.readFile as any).mockResolvedValue("# ASF\n\nASF experiment workflow");

      const results = await skillManager.findSkills("asf", { refresh: true });

      expect(results).toEqual([
        expect.objectContaining({
          name: "asf",
          registry: "example/private-skills",
          path: "skills/asf",
          description: "ASF experiment workflow",
        }),
      ]);
      expect(mockedFs.opendir).toHaveBeenCalledWith(path.join(expectedRegistryPath, "skills"));
      expect(mockedFs.opendir).not.toHaveBeenCalledWith(path.join(unrelatedRegistryPath, "skills"));
    });
  });
});
