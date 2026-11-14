import { Command } from "commander";

const { mockPluginManager, mockUi } = vi.hoisted(() => ({
  mockPluginManager: {
    update: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
  },
  mockUi: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    text: vi.fn(),
    summary: vi.fn(),
    table: vi.fn(),
  },
}));

vi.mock("../../src/services/plugin/plugin-manager.service.js", () => ({
  createPluginManager: () => mockPluginManager,
}));

vi.mock("../../src/util/terminal-ui.js", () => ({
  ui: mockUi,
}));

import { registerPluginCommand } from "../../src/commands/plugin.js";

describe("plugin command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPluginManager.update.mockResolvedValue([]);
    mockPluginManager.add.mockResolvedValue(undefined);
    mockPluginManager.remove.mockResolvedValue(undefined);
    mockPluginManager.list.mockResolvedValue([]);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as any);
  });

  it("registers plugin add and delegates to the plugin manager", async () => {
    const program = new Command();
    registerPluginCommand(program);

    await program.parseAsync(["node", "test", "plugin", "add", "@ai-devkit/memory-dashboard"]);

    expect(mockPluginManager.add).toHaveBeenCalledWith("@ai-devkit/memory-dashboard");
    expect(mockUi.success).toHaveBeenCalledWith("Plugin added: @ai-devkit/memory-dashboard");
  });

  it("registers plugin remove and delegates to the plugin manager", async () => {
    const program = new Command();
    registerPluginCommand(program);

    await program.parseAsync(["node", "test", "plugin", "remove", "@ai-devkit/memory-dashboard"]);

    expect(mockPluginManager.remove).toHaveBeenCalledWith("@ai-devkit/memory-dashboard");
    expect(mockUi.success).toHaveBeenCalledWith("Plugin removed: @ai-devkit/memory-dashboard");
  });

  it("renders plugin list results as a table", async () => {
    mockPluginManager.list.mockResolvedValue([
      {
        name: "@ai-devkit/memory-dashboard",
        status: "valid",
        error: undefined,
      },
      {
        name: "@ai-devkit/bad-plugin",
        status: "invalid",
        error: "missing manifest",
      },
    ]);

    const program = new Command();
    registerPluginCommand(program);

    await program.parseAsync(["node", "test", "plugin", "list"]);

    expect(mockUi.table).toHaveBeenCalledWith({
      headers: ["package", "status", "error"],
      rows: [
        ["@ai-devkit/memory-dashboard", "valid", ""],
        ["@ai-devkit/bad-plugin", "invalid", "missing manifest"],
      ],
    });
  });

  it("warns when no plugins are configured", async () => {
    const program = new Command();
    registerPluginCommand(program);

    await program.parseAsync(["node", "test", "plugin", "list"]);

    expect(mockUi.warning).toHaveBeenCalledWith("No global plugins configured.");
    expect(mockUi.table).not.toHaveBeenCalled();
  });
  describe("update", () => {
    let previousExitCode: typeof process.exitCode;
    beforeEach(() => {
      previousExitCode = process.exitCode;
      process.exitCode = undefined;
    });
    afterEach(() => {
      process.exitCode = previousExitCode;
    });
    async function run(name?: string) {
      const program = new Command();
      registerPluginCommand(program);
      await program.parseAsync(["node", "test", "plugin", "update", ...(name ? [name] : [])]);
    }
    it("updates a selected package and renders observed major change", async () => {
      mockPluginManager.update.mockResolvedValue([
        {
          name: "@scope/plugin",
          status: "updated",
          fromVersion: "1.0.0",
          targetVersion: "2.0.0",
          toVersion: "3.0.0",
        },
      ]);
      await run("@scope/plugin");
      expect(mockPluginManager.update).toHaveBeenCalledExactlyOnceWith("@scope/plugin");
      expect(mockUi.table).toHaveBeenCalledWith({
        headers: ["package", "status", "version", "notes"],
        rows: [["@scope/plugin", "updated", "1.0.0 → 3.0.0", "MAJOR"]],
      });
      expect(process.exitCode).toBeUndefined();
    });
    it("renders mixed states, recovery context and summary before returning failure", async () => {
      mockPluginManager.update.mockResolvedValue([
        { name: "updated", status: "updated", fromVersion: "1.0.0", toVersion: "1.1.0" },
        { name: "same", status: "up-to-date", fromVersion: "1.0.0", toVersion: "1.0.0" },
        {
          name: "failed",
          status: "failed",
          fromVersion: "1.0.0",
          targetVersion: "2.0.0",
          error: "offline",
        },
        { name: "unknown", status: "failed", targetVersion: "1.0.0" },
        {
          name: "invalid",
          status: "failed",
          fromVersion: "1.0.0",
          targetVersion: "2.0.0",
          toVersion: "3.0.0",
          error: "manifest",
        },
      ]);
      await run();
      expect(mockPluginManager.update).toHaveBeenCalledExactlyOnceWith(undefined);
      const { rows } = mockUi.table.mock.calls[0][0];
      expect(rows[0]).toEqual(["updated", "updated", "1.0.0 → 1.1.0", ""]);
      expect(rows[1]).toEqual(["same", "up-to-date", "1.0.0 → 1.0.0", ""]);
      expect(rows[2][2]).toBe("1.0.0 → unknown");
      expect(rows[2][3]).toContain("Attempted target: 2.0.0 (MAJOR)");
      expect(rows[2][3]).toContain("Previously installed: 1.0.0");
      expect(rows[2][3]).toContain("offline");
      expect(rows[3][3]).toContain("Previously installed: unknown");
      expect(rows[4][2]).toBe("1.0.0 → 3.0.0");
      expect(rows[4][3]).toContain("MAJOR");
      expect(
        rows
          .filter((row: string[]) => row[1] === "failed")
          .every((row: string[]) => row[3].includes("Manual recovery")),
      ).toBe(true);
      expect(mockUi.summary).toHaveBeenCalledWith({
        title: "Summary",
        items: [
          { type: "success", count: 1, label: "updated" },
          { type: "warning", count: 1, label: "up-to-date" },
          { type: "error", count: 3, label: "failed" },
        ],
      });
      expect(process.exitCode).toBe(1);
    });
    it("prints unknown recovery version when metadata lookup fails before a target is known", async () => {
      mockPluginManager.update.mockResolvedValue([
        { name: "missing", status: "failed", error: "missing metadata" },
      ]);
      await run();
      const row = mockUi.table.mock.calls[0][0].rows[0];
      expect(row[2]).toBe("unknown → unknown");
      expect(row[3]).toContain("Previously installed: unknown");
      expect(row[3]).not.toContain("Attempted target");
      expect(process.exitCode).toBe(1);
    });

    it("warns on an empty configuration and succeeds", async () => {
      await run();
      expect(mockUi.warning).toHaveBeenCalledWith("No global plugins configured.");
      expect(mockUi.table).not.toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    });
  });
});
