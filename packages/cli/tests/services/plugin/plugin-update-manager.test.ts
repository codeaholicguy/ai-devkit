import { createPluginManager } from "../../../src/services/plugin/plugin-manager.service.js";

describe("plugin update manager", () => {
  function setup(names = ["plugin"]) {
    const packages = {
      ensureGlobalNpmProject: vi.fn(),
      install: vi.fn(),
      uninstall: vi.fn(),
      getInstalledVersion: vi.fn().mockResolvedValue("1.0.0"),
      getLatestVersion: vi.fn().mockResolvedValue("2.0.0"),
      installLatest: vi.fn().mockResolvedValue(undefined),
    };
    const config = {
      getPlugins: vi.fn().mockResolvedValue(names),
      addPlugin: vi.fn(),
      removePlugin: vi.fn(),
    };
    const validateInstalledPlugin = vi.fn().mockResolvedValue(undefined);
    const manager = createPluginManager({ packages, config, validateInstalledPlugin });
    return { manager, packages, config, validateInstalledPlugin };
  }
  it("updates only the requested configured plugin and reports actual tag-race version", async () => {
    const { manager, packages, config, validateInstalledPlugin } = setup([
      "other",
      "@scope/plugin",
    ]);
    packages.getInstalledVersion.mockResolvedValueOnce("1.0.0").mockResolvedValueOnce("3.0.0");
    expect(await manager.update(" @scope/plugin ")).toEqual([
      {
        name: "@scope/plugin",
        status: "updated",
        fromVersion: "1.0.0",
        targetVersion: "2.0.0",
        toVersion: "3.0.0",
      },
    ]);
    expect(packages.installLatest).toHaveBeenCalledExactlyOnceWith("@scope/plugin");
    expect(validateInstalledPlugin).toHaveBeenCalledExactlyOnceWith("@scope/plugin");
    expect(config.addPlugin).not.toHaveBeenCalled();
    expect(config.removePlugin).not.toHaveBeenCalled();
  });
  it("skips equal versions without installation or manifest repair", async () => {
    const { manager, packages, validateInstalledPlugin } = setup();
    packages.getLatestVersion.mockResolvedValue("1.0.0");
    expect(await manager.update()).toEqual([
      {
        name: "plugin",
        status: "up-to-date",
        fromVersion: "1.0.0",
        targetVersion: "1.0.0",
        toVersion: "1.0.0",
      },
    ]);
    expect(packages.installLatest).not.toHaveBeenCalled();
    expect(validateInstalledPlugin).not.toHaveBeenCalled();
  });
  it.each(["missing", "../escape", "plugin@1"])(
    "rejects target %s without npm operations",
    async (name) => {
      const { manager, packages } = setup();
      await expect(manager.update(name)).rejects.toThrow();
      expect(packages.getInstalledVersion).not.toHaveBeenCalled();
      expect(packages.installLatest).not.toHaveBeenCalled();
    },
  );
  it("returns no results for an empty configuration", async () => {
    expect(await setup([]).manager.update()).toEqual([]);
  });
  it.each(["installed", "registry", "install", "read-after", "manifest"])(
    "preserves available metadata after %s failure and never rolls back",
    async (stage) => {
      const { manager, packages, config, validateInstalledPlugin } = setup();
      const error = new Error("broken");
      if (stage === "installed") packages.getInstalledVersion.mockRejectedValue(error);
      if (stage === "registry") packages.getLatestVersion.mockRejectedValue(error);
      if (stage === "install") packages.installLatest.mockRejectedValue(error);
      if (stage === "read-after")
        packages.getInstalledVersion.mockResolvedValueOnce("1.0.0").mockRejectedValueOnce(error);
      if (stage === "manifest") {
        packages.getInstalledVersion.mockResolvedValueOnce("1.0.0").mockResolvedValueOnce("2.0.0");
        validateInstalledPlugin.mockRejectedValue(error);
      }
      const [result] = await manager.update();
      expect(result).toEqual({
        name: "plugin",
        status: "failed",
        error: "broken",
        ...(stage !== "installed" ? { fromVersion: "1.0.0" } : {}),
        ...(!["installed", "registry"].includes(stage) ? { targetVersion: "2.0.0" } : {}),
        ...(stage === "manifest" ? { toVersion: "2.0.0" } : {}),
      });
      expect(packages.uninstall).not.toHaveBeenCalled();
      expect(config.addPlugin).not.toHaveBeenCalled();
      expect(config.removePlugin).not.toHaveBeenCalled();
      if (stage === "installed") expect(packages.getLatestVersion).not.toHaveBeenCalled();
    },
  );
  it("continues sequentially after a failure", async () => {
    const { manager, packages } = setup(["first", "second", "third"]);
    const events: string[] = [];
    packages.getInstalledVersion.mockImplementation(async (name: string) => {
      events.push(name);
      return "1.0.0";
    });
    packages.installLatest.mockImplementation(async (name: string) => {
      events.push(`install:${name}`);
      if (name === "first") throw new Error("failed");
    });
    packages.getLatestVersion.mockImplementation(async (name: string) =>
      name === "second" ? "1.0.0" : "2.0.0",
    );
    expect((await manager.update()).map((r) => r.status)).toEqual([
      "failed",
      "up-to-date",
      "updated",
    ]);
    expect(events).toEqual(["first", "install:first", "second", "third", "install:third", "third"]);
  });
});
