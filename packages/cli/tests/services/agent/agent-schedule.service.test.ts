import { beforeEach, describe, expect, it, vi } from "vitest";
import { DaemonRpcError, type ScheduledSend } from "@ai-devkit/daemon-client";
import {
  AgentScheduleService,
  ScheduledSendInvalidParamsError,
  ScheduledSendNotCancellableError,
  ScheduledSendNotFoundError,
  ScheduledSendStorageError,
} from "../../../src/services/agent/agent-schedule.service.js";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  close: vi.fn(),
  createSchedule: vi.fn(),
  listSchedules: vi.fn(),
  cancelSchedule: vi.fn(),
}));

vi.mock("@ai-devkit/daemon-client", async (original) => ({
  ...(await original<object>()),
  ensureDaemon: mocks.ensure,
}));

const sample: ScheduledSend = {
  id: "sch_1234abcd",
  agentName: "worker-1",
  message: "checkin",
  dueAt: "2026-11-25T21:00:00.000Z",
  status: "pending",
  createdAt: "2026-11-25T20:00:00.000Z",
};

function makeClient() {
  return {
    createSchedule: mocks.createSchedule,
    listSchedules: mocks.listSchedules,
    cancelSchedule: mocks.cancelSchedule,
    close: mocks.close,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensure.mockResolvedValue(makeClient());
  mocks.createSchedule.mockResolvedValue(sample);
  mocks.listSchedules.mockResolvedValue([sample]);
  mocks.cancelSchedule.mockResolvedValue({ ...sample, status: "cancelled" });
});

describe("AgentScheduleService", () => {
  it("routes create, list, and cancel through DaemonClient and closes owned client", async () => {
    const svc = new AgentScheduleService();
    await expect(
      svc.create({ agentName: "worker-1", message: "checkin", dueAt: sample.dueAt }),
    ).resolves.toEqual(sample);
    await expect(svc.list({ status: "pending", limit: 10 })).resolves.toEqual([sample]);
    await expect(svc.cancel("sch_1234abcd")).resolves.toMatchObject({ status: "cancelled" });
    expect(mocks.close).toHaveBeenCalledTimes(3);
  });

  it("reuses a caller-owned client without closing it", async () => {
    const client = makeClient();
    const svc = new AgentScheduleService({ client: client as any });
    await svc.list();
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", ScheduledSendNotFoundError],
    ["not_cancellable", ScheduledSendNotCancellableError],
    ["invalid_params", ScheduledSendInvalidParamsError],
    ["storage", ScheduledSendStorageError],
  ])("maps coded error %s to domain error", async (code, ErrorType) => {
    mocks.cancelSchedule.mockRejectedValue(
      new DaemonRpcError("domain error", code, { id: "sch_1234abcd", status: "sent" }),
    );
    await expect(new AgentScheduleService().cancel("sch_1234abcd")).rejects.toBeInstanceOf(
      ErrorType,
    );
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("fails clearly when no daemon is running", async () => {
    mocks.ensure.mockResolvedValue(null);
    await expect(new AgentScheduleService().list()).rejects.toThrow(/daemon.*required/i);
  });

  it("requires daemon upgrade on unknown method", async () => {
    mocks.listSchedules.mockRejectedValue(new DaemonRpcError("unknown method: schedule.list"));
    await expect(new AgentScheduleService().list()).rejects.toThrow(/upgrade|restart/i);
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
