const mockUi = vi.hoisted(() => ({
  summary: vi.fn(),
  warning: vi.fn(),
  text: vi.fn(),
}));

vi.mock("../../../src/util/terminal-ui.js", () => ({ ui: mockUi }));

import { renderApplicationReport } from "../../../src/services/install/install-report.js";

describe("application report renderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders matched states and incomplete failures truthfully", () => {
    renderApplicationReport(
      {
        environments: { installed: 0, skipped: 0, failed: 0 },
        phases: { installed: 0, skipped: 1, failed: 0 },
        skills: { installed: 0, skipped: 1, failed: 0 },
        mcpServers: { installed: 0, skipped: 1, conflicts: 0, failed: 1, items: [] },
        warnings: [],
        items: [
          { section: "skill", name: "verify", status: "matched" },
          { section: "mcpServer", name: "memory", status: "failed", message: "bad TOML" },
        ],
        complete: false,
      },
      "Initialization Summary",
    );

    expect(mockUi.summary).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Initialization Summary",
        items: expect.arrayContaining([
          expect.objectContaining({ label: "artifact(s) already matched", count: 1 }),
          expect.objectContaining({ label: "artifact(s) failed", count: 1 }),
        ]),
      }),
    );
    expect(mockUi.warning).toHaveBeenCalledWith(expect.stringContaining("memory: bad TOML"));
  });

  it("prints one warning for unreachable optional skills without duplicating report.warnings", () => {
    renderApplicationReport({
      environments: { installed: 0, skipped: 0, failed: 0 },
      phases: { installed: 0, skipped: 0, failed: 0 },
      skills: { installed: 0, skipped: 1, failed: 0 },
      mcpServers: { installed: 0, skipped: 0, conflicts: 0, failed: 0, items: [] },
      warnings: [],
      items: [
        {
          section: "skill",
          name: "release-ai-devkit",
          status: "skipped",
          message:
            "Skill personal/me/release-ai-devkit: could not be fetched (registry may be private or unreachable).",
        },
      ],
      complete: true,
    });

    expect(mockUi.warning).toHaveBeenCalledTimes(1);
    expect(mockUi.warning).toHaveBeenCalledWith(
      "Skill personal/me/release-ai-devkit: could not be fetched (registry may be private or unreachable).",
    );
    expect(mockUi.summary).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ label: "artifact(s) failed", count: 0 }),
          expect.objectContaining({ label: "artifact(s) preserved", count: 1 }),
        ]),
      }),
    );
  });
});
