import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { DaemonRpcError, type ScheduledSend } from "@ai-devkit/daemon-client";
import { assertSendTargetOptions } from "../../src/services/agent/agent.service.js";
import { registerAgentSendCommand } from "../../src/commands/agent/send.command.js";
import { registerAgentScheduleCommand } from "../../src/commands/agent/schedule.command.js";

const mocks = vi.hoisted(() => ({
  ensureDaemon: vi.fn(),
  lookupAgent: vi.fn(),
  listAgents: vi.fn(),
  createSchedule: vi.fn(),
  listSchedules: vi.fn(),
  cancelSchedule: vi.fn(),
  close: vi.fn(),
  resolveDurable: vi.fn(),
  uiSuccess: vi.fn(),
  uiWarning: vi.fn(),
  uiInfo: vi.fn(),
  uiError: vi.fn(),
  uiTable: vi.fn(),
}));

vi.mock("@ai-devkit/daemon-client", async (original) => ({
  ...(await original<object>()),
  ensureDaemon: mocks.ensureDaemon,
}));

vi.mock("../../src/services/agent/resolve-agent.service.js", async (original) => ({
  ...(await original<object>()),
  resolveDurableAgentEntry: mocks.resolveDurable,
}));

vi.mock("../../src/util/terminal-ui.js", () => ({
  ui: {
    success: mocks.uiSuccess,
    warning: mocks.uiWarning,
    info: mocks.uiInfo,
    error: mocks.uiError,
    table: mocks.uiTable,
    text: vi.fn(),
  },
}));

const sampleSchedule: ScheduledSend = {
  id: "sch_deadbeef",
  agentName: "worker-1",
  message: "checkin",
  dueAt: "2026-11-26T12:00:00.000Z",
  status: "pending",
  createdAt: "2026-11-25T20:00:00.000Z",
};

function makeDaemon() {
  return {
    lookupAgent: mocks.lookupAgent,
    listAgents: mocks.listAgents,
    createSchedule: mocks.createSchedule,
    listSchedules: mocks.listSchedules,
    cancelSchedule: mocks.cancelSchedule,
    close: mocks.close,
  };
}

function buildProgram() {
  const program = new Command();
  program.exitOverride();
  const agent = program.command("agent");
  registerAgentSendCommand(agent);
  registerAgentScheduleCommand(agent);
  return program;
}

describe("scheduled send CLI", () => {
  const savedExitCode = process.exitCode;
  const savedAgentEnv = process.env.AI_DEVKIT_AGENT_NAME;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    delete process.env.AI_DEVKIT_AGENT_NAME;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mocks.resolveDurable.mockResolvedValue(null);
    mocks.ensureDaemon.mockResolvedValue(makeDaemon());
    mocks.lookupAgent.mockResolvedValue({
      name: "worker-1",
      type: "claude",
      pid: 123,
      runtime: "tmux",
      runtimeRef: { session: "worker-1" },
      cwd: "/repo",
      pinned: false,
      alive: true,
    });
    mocks.listAgents.mockResolvedValue([]);
    mocks.createSchedule.mockResolvedValue(sampleSchedule);
    mocks.listSchedules.mockResolvedValue([sampleSchedule]);
    mocks.cancelSchedule.mockResolvedValue({ ...sampleSchedule, status: "cancelled" });
  });

  afterEach(() => {
    process.exitCode = savedExitCode;
    if (savedAgentEnv === undefined) delete process.env.AI_DEVKIT_AGENT_NAME;
    else process.env.AI_DEVKIT_AGENT_NAME = savedAgentEnv;
    logSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe("assertSendTargetOptions schedule flag matrix", () => {
    it("enforces --in XOR --at and rejects incompatible flags", () => {
      expect(() =>
        assertSendTargetOptions({ id: "w", in: "15m", at: "2099-01-01T00:00:00Z" }),
      ).toThrow("Use either --in or --at, not both.");
      expect(() => assertSendTargetOptions({ group: "team", in: "15m" })).toThrow(
        /not supported with --group/i,
      );
      expect(() => assertSendTargetOptions({ id: "w", in: "15m", wait: true })).toThrow(
        /Cannot combine --in\/--at with --wait/i,
      );
      expect(() => assertSendTargetOptions({ id: "w", in: "15m", timeout: "5000" })).toThrow(
        /Cannot combine --in\/--at with --wait/i,
      );
      expect(() => assertSendTargetOptions({ id: "w", in: "15m" })).not.toThrow();
      expect(() => assertSendTargetOptions({ id: "w", at: "2099-01-01T00:00:00Z" })).not.toThrow();
    });
  });

  it("schedules via --in, captures AI_DEVKIT_AGENT_NAME, and prints human confirmation", async () => {
    process.env.AI_DEVKIT_AGENT_NAME = "orchestrator";
    await buildProgram().parseAsync([
      "node",
      "ai-devkit",
      "agent",
      "send",
      "--id",
      "worker-1",
      "--in",
      "15m",
      "checkin",
    ]);

    expect(mocks.createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: "worker-1",
        message: "checkin",
        createdBy: "orchestrator",
      }),
    );
    expect(mocks.uiWarning).not.toHaveBeenCalled();
    expect(mocks.uiSuccess).toHaveBeenCalledWith(expect.stringContaining("sch_deadbeef"));
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("warns to stderr when target is not currently live and outputs pure JSON under --json", async () => {
    mocks.lookupAgent.mockRejectedValue(new DaemonRpcError("not found", "not_found"));
    mocks.listAgents.mockResolvedValue([]);

    await buildProgram().parseAsync([
      "node",
      "ai-devkit",
      "agent",
      "send",
      "--id",
      "future-worker",
      "--at",
      "2099-01-01T00:00:00Z",
      "--json",
      "wake up",
    ]);

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("future-worker"));
    expect(mocks.uiWarning).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(sampleSchedule, null, 2));
    expect(mocks.createSchedule).toHaveBeenCalledWith({
      agentName: "future-worker",
      message: "wake up",
      dueAt: "2099-01-01T00:00:00.000Z",
    });
  });

  it("rejects durable targets upfront before contacting schedule.create", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    mocks.resolveDurable.mockResolvedValue({ id: "dur-1", name: "dur-agent", provider: "claude" });

    try {
      await buildProgram().parseAsync([
        "node",
        "ai-devkit",
        "agent",
        "send",
        "--id",
        "dur-agent",
        "--in",
        "5m",
        "hello",
      ]);

      expect(mocks.createSchedule).not.toHaveBeenCalled();
      expect(mocks.uiError).toHaveBeenCalledWith(expect.stringMatching(/durable agent/i));
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("shows empty info message when no schedules exist", async () => {
    mocks.listSchedules.mockResolvedValue([]);
    await buildProgram().parseAsync(["node", "ai-devkit", "agent", "schedule", "list"]);
    expect(mocks.uiInfo).toHaveBeenCalledWith("No scheduled sends.");
    expect(mocks.uiTable).not.toHaveBeenCalled();
  });

  it("rejects non-numeric --limit on schedule list", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    try {
      await buildProgram().parseAsync([
        "node",
        "ai-devkit",
        "agent",
        "schedule",
        "list",
        "--limit",
        "abc",
      ]);
      expect(mocks.listSchedules).not.toHaveBeenCalled();
      expect(mocks.uiError).toHaveBeenCalledWith(expect.stringMatching(/Invalid --limit/));
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("lists schedules in table and JSON formats and passes filters", async () => {
    await buildProgram().parseAsync([
      "node",
      "ai-devkit",
      "agent",
      "schedule",
      "list",
      "--status",
      "pending",
      "--agent",
      "worker-1",
      "--limit",
      "5",
    ]);
    expect(mocks.listSchedules).toHaveBeenCalledWith({
      status: "pending",
      agentName: "worker-1",
      limit: 5,
    });
    expect(mocks.uiTable).toHaveBeenCalledOnce();

    await buildProgram().parseAsync(["node", "ai-devkit", "agent", "schedule", "list", "--json"]);
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify([sampleSchedule], null, 2));
  });

  it("cancels a pending schedule and prints confirmation or JSON", async () => {
    await buildProgram().parseAsync([
      "node",
      "ai-devkit",
      "agent",
      "schedule",
      "cancel",
      "sch_deadbeef",
    ]);
    expect(mocks.cancelSchedule).toHaveBeenCalledWith("sch_deadbeef");
    expect(mocks.uiSuccess).toHaveBeenCalledWith(expect.stringContaining("sch_deadbeef"));

    await buildProgram().parseAsync([
      "node",
      "ai-devkit",
      "agent",
      "schedule",
      "cancel",
      "sch_deadbeef",
      "--json",
    ]);
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ ...sampleSchedule, status: "cancelled" }, null, 2),
    );
  });
});
