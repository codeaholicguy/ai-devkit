import { describe, expect, it, vi } from "vitest";
import { DaemonClient } from "../src/client.js";

describe("DaemonClient schedule methods", () => {
  it("forwards schedule.create, schedule.list, and schedule.cancel with expected payloads", async () => {
    const client = Object.create(DaemonClient.prototype) as DaemonClient;
    const req = vi.fn().mockResolvedValue([]);
    client.request = req;

    await client.createSchedule({
      agentName: "worker",
      message: "hi",
      dueAt: "2026-11-25T21:00:00.000Z",
      createdBy: "orch",
    });
    await client.listSchedules({ status: "pending", limit: 20 });
    await client.listSchedules();
    await client.cancelSchedule("sch_11223344");

    expect(req.mock.calls).toEqual([
      [
        "schedule.create",
        {
          agentName: "worker",
          message: "hi",
          dueAt: "2026-11-25T21:00:00.000Z",
          createdBy: "orch",
        },
      ],
      ["schedule.list", { status: "pending", limit: 20 }],
      ["schedule.list", {}],
      ["schedule.cancel", { id: "sch_11223344" }],
    ]);
  });
});
