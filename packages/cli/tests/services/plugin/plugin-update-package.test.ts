import fs from "fs-extra";
import os from "os";
import path from "path";
import { createPluginPackageService } from "../../../src/services/plugin/plugin-package.service.js";

describe("plugin update package operations", () => {
  let home: string;
  let runNpm: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-update-"));
    vi.stubEnv("HOME", home);
    runNpm = vi.fn().mockResolvedValue(undefined);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.remove(home);
  });
  async function installed(version: unknown, name = "@scope/plugin") {
    await fs.outputJson(path.join(home, ".ai-devkit/npm/node_modules", name, "package.json"), {
      version,
    });
  }
  it.each(["plugin", "@scope/plugin"])(
    "reads installed %s without initializing npm project",
    async (name) => {
      await installed("1.2.3-beta.1+build", name);
      expect(await createPluginPackageService({ runNpm }).getInstalledVersion(name)).toBe(
        "1.2.3-beta.1+build",
      );
      expect(await fs.pathExists(path.join(home, ".ai-devkit/npm/package.json"))).toBe(false);
      expect(runNpm).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, 123, "", "1.2", "01.2.3", "1.2.3-01", "1.2.3-", "1.2.3+", "1.2.3\n"])(
    "rejects installed version %s",
    async (version) => {
      await installed(version);
      await expect(
        createPluginPackageService({ runNpm }).getInstalledVersion("@scope/plugin"),
      ).rejects.toThrow(/version/i);
    },
  );
  it("queries explicit latest and parses stdout", async () => {
    runNpm.mockResolvedValue('"2.0.0"\n');
    expect(await createPluginPackageService({ runNpm }).getLatestVersion("@scope/plugin")).toBe(
      "2.0.0",
    );
    expect(runNpm).toHaveBeenCalledWith(["view", "@scope/plugin@latest", "version", "--json"], {
      cwd: path.join(home, ".ai-devkit/npm"),
    });
  });
  it.each([undefined, "", "not json", "[]", "123", '"01.0.0"'])(
    "rejects registry output %s",
    async (output) => {
      runNpm.mockResolvedValue(output);
      await expect(
        createPluginPackageService({ runNpm }).getLatestVersion("plugin"),
      ).rejects.toThrow(/plugin/);
    },
  );
  it("installs explicit latest with a void mutation runner", async () => {
    await createPluginPackageService({ runNpm }).installLatest("@scope/plugin");
    expect(runNpm).toHaveBeenCalledWith(["install", "@scope/plugin@latest"], {
      cwd: path.join(home, ".ai-devkit/npm"),
    });
  });
  it.each(["getInstalledVersion", "getLatestVersion", "installLatest"] as const)(
    "rejects unsafe names in %s",
    async (method) => {
      await expect(createPluginPackageService({ runNpm })[method]("../escape")).rejects.toThrow(
        "Only npm package names",
      );
      expect(runNpm).not.toHaveBeenCalled();
    },
  );
  it("reports contextual read, query and install failures", async () => {
    runNpm.mockRejectedValue(new Error("offline"));
    const service = createPluginPackageService({ runNpm });
    await expect(service.getInstalledVersion("plugin")).rejects.toThrow(/plugin/);
    await expect(service.getLatestVersion("plugin")).rejects.toThrow(/plugin.*offline/);
    await expect(service.installLatest("plugin")).rejects.toThrow(/plugin.*offline/);
  });
  it("captures registry stdout through the default npm subprocess runner", async () => {
    const bin = path.join(home, "bin");
    await fs.ensureDir(bin);
    await fs.ensureDir(path.join(home, ".ai-devkit/npm"));
    await fs.writeFile(path.join(bin, "npm"), `#!/bin/sh\nprintf '"4.5.6"\\n'\n`, { mode: 0o755 });
    vi.stubEnv("PATH", `${bin}:${process.env.PATH}`);
    expect(await createPluginPackageService().getLatestVersion("plugin")).toBe("4.5.6");
  });

  it("rejects a null installed manifest", async () => {
    await fs.outputJson(path.join(home, ".ai-devkit/npm/node_modules/plugin/package.json"), null);
    await expect(
      createPluginPackageService({ runNpm }).getInstalledVersion("plugin"),
    ).rejects.toThrow(/version/);
  });
});
