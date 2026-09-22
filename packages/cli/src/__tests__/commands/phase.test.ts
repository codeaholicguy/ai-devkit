const { mockConfigManager, mockTemplateManager, mockConfirm, mockUi } =
  vi.hoisted(() => ({
    mockConfigManager: {
      exists: vi.fn(),
      getDocsDir: vi.fn(),
      read: vi.fn(),
      addPhase: vi.fn(),
    },
    mockTemplateManager: {
      fileExists: vi.fn(),
      copyPhaseTemplate: vi.fn(),
    },
    mockConfirm: vi.fn(),
    mockUi: {
      error: vi.fn(),
      warning: vi.fn(),
      success: vi.fn(),
      info: vi.fn(),
      text: vi.fn(),
      breakline: vi.fn(),
    },
  }));

vi.mock("chalk", () => ({
  default: {
    dim: (text: string) => `[dim]${text}[/dim]`,
  },
}));

vi.mock("@inquirer/prompts", () => ({
  confirm: (...args: unknown[]) => mockConfirm(...args),
  select: vi.fn(),
}));

vi.mock("../../lib/Config.js", () => ({
  ConfigManager: vi.fn(function () {
    return mockConfigManager;
  }),
}));

vi.mock("../../lib/TemplateManager.js", () => ({
  TemplateManager: vi.fn(function () {
    return mockTemplateManager;
  }),
}));

vi.mock("../../util/terminal-ui.js", () => ({
  ui: mockUi,
}));

import { phaseCommand } from "../../commands/phase.js";

describe("phase command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigManager.exists.mockResolvedValue(true);
    mockConfigManager.getDocsDir.mockResolvedValue("docs/ai");
    mockConfigManager.addPhase.mockResolvedValue(undefined);
    mockTemplateManager.fileExists.mockResolvedValue(false);
    mockTemplateManager.copyPhaseTemplate.mockResolvedValue(
      "docs/ai/requirements.md",
    );
  });

  it("prints a success headline and dim file location without embedded trailing newlines", async () => {
    await phaseCommand("requirements");

    expect(mockUi.success).toHaveBeenCalledWith(
      "Requirements & Problem Understanding created successfully.",
    );
    expect(mockUi.text).toHaveBeenCalledWith(
      "[dim]  - docs/ai/requirements.md[/dim]",
    );
    expect(mockUi.info).not.toHaveBeenCalled();
    for (const call of [
      ...mockUi.text.mock.calls,
      ...mockUi.success.mock.calls,
    ]) {
      expect(call[0]).not.toMatch(/\n$/);
    }
  });
});
