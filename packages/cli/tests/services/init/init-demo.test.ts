import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_LEAD_NAME,
  DEMO_WORKER_NAME,
  DEMO_WORKER_PROMPT,
  DEMO_TOKEN,
  listInstalledHarnessTypes,
  pickDemoHarnessPair,
  formatInsufficientHarnessesMessage,
  runInitDemo,
} from "../../../src/services/init/init-demo.service.js";
import { ui } from "../../../src/util/terminal-ui.js";

describe("init-demo harness detection", () => {
  it("lists installed harnesses in preference order", () => {
    const installed = listInstalledHarnessTypes((command) =>
      ["codex", "opencode"].includes(command),
    );
    expect(installed).toEqual(["codex", "opencode"]);
  });

  it("picks the first two installed harnesses", () => {
    expect(pickDemoHarnessPair(["codex", "claude", "pi"])).toEqual({
      lead: "codex",
      worker: "claude",
    });
  });

  it("returns null when fewer than two harnesses are installed", () => {
    expect(pickDemoHarnessPair(["claude"])).toBeNull();
  });

  it("formats actionable guidance when only one harness is found", () => {
    const message = formatInsufficientHarnessesMessage(["claude"]);
    expect(message).toContain("claude");
    expect(message).toMatch(/codex|opencode/i);
  });
});

describe("runInitDemo", () => {
  const mockStart = vi.fn();
  const mockSend = vi.fn();
  const mockUi = {
    text: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    breakline: vi.fn(),
  };
  const baseDeps = {
    platform: "linux" as const,
    commandExists: (cmd: string) => cmd === "tmux" || cmd === "claude" || cmd === "codex",
    resolveTmuxInstall: async () => ({
      command: "sudo apt install tmux",
      message: "Install tmux.",
    }),
    getRuntimeProvider: async () => "tmux" as const,
    startAgent: mockStart,
    sendToAgent: mockSend,
    ui: mockUi,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStart.mockImplementation(async ({ type, name }: { type: string; name: string }) => ({
      name,
      type,
      pid: 100,
      runtime: "tmux",
      runtimeRef: { session: `demo-${name}` },
      cwd: "/tmp/project",
    }));
    mockSend.mockResolvedValue(undefined);
  });

  it("rejects Windows with a clear message", async () => {
    const code = await runInitDemo(
      { cwd: "/tmp/project" },
      { ...baseDeps, platform: "win32", commandExists: () => true },
    );
    expect(code).toBe(1);
    expect(mockUi.error).toHaveBeenCalledWith(
      expect.stringMatching(/macOS and Linux only|Windows/i),
    );
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("fails when tmux is missing", async () => {
    const code = await runInitDemo(
      { cwd: "/tmp/project" },
      {
        ...baseDeps,
        commandExists: (cmd) => cmd === "claude" || cmd === "codex",
      },
    );
    expect(code).toBe(1);
    expect(mockUi.error).toHaveBeenCalledWith(expect.stringMatching(/tmux/i));
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("fails when fewer than two harnesses are installed", async () => {
    const code = await runInitDemo(
      { cwd: "/tmp/project" },
      {
        ...baseDeps,
        commandExists: (cmd) => cmd === "tmux" || cmd === "claude",
      },
    );
    expect(code).toBe(1);
    expect(mockUi.error).toHaveBeenCalledWith(expect.stringContaining("claude"));
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("starts lead and worker then runs scripted send handoff", async () => {
    mockSend.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      messages: [{ role: "assistant", content: DEMO_TOKEN }],
      agentName: DEMO_WORKER_NAME,
      agentType: "codex",
    });

    const code = await runInitDemo({ cwd: "/tmp/project" }, baseDeps);

    expect(code).toBe(0);
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(mockStart.mock.calls[0][0]).toMatchObject({
      name: DEMO_WORKER_NAME,
      type: "codex",
    });
    expect(mockStart.mock.calls[1][0]).toMatchObject({
      name: DEMO_LEAD_NAME,
      type: "claude",
    });
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[0][0]).toMatchObject({
      id: DEMO_LEAD_NAME,
      wait: false,
    });
    expect(mockSend.mock.calls[1][0]).toMatchObject({
      id: DEMO_WORKER_NAME,
      prompt: DEMO_WORKER_PROMPT,
      wait: true,
    });
    expect(mockUi.success).toHaveBeenCalledWith(expect.stringMatching(/Demo complete/i));
    expect(mockUi.text).toHaveBeenCalledWith(expect.stringContaining("ai-devkit agent list"));
    expect(mockUi.text).toHaveBeenCalledWith(expect.stringContaining("ai-devkit agent console"));
    expect(mockUi.text).toHaveBeenCalledWith(expect.stringContaining("ai-devkit status"));
  });

  it("does not write to the real ui sink when a custom ui is injected", async () => {
    const textSpy = vi.spyOn(ui, "text");
    mockSend.mockResolvedValue({
      messages: [{ role: "assistant", content: DEMO_TOKEN }],
      agentName: DEMO_WORKER_NAME,
      agentType: "codex",
    });

    await runInitDemo({ cwd: "/tmp/project" }, baseDeps);

    expect(textSpy).not.toHaveBeenCalled();
    textSpy.mockRestore();
  });
});
