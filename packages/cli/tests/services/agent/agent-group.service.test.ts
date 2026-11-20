import { vi } from "vitest";
import { DaemonRpcError } from "@ai-devkit/daemon-client";
import {
  AgentGroupService,
  AgentGroupConflictError,
  AgentGroupEmptyMembersError,
  AgentGroupInvalidMemberError,
  AgentGroupInvalidNameError,
  AgentGroupNotFoundError,
  AgentGroupStorageError,
} from "../../../src/services/agent/agent-group.service.js";
vi.mock("os", () => ({ default: { homedir: () => "/tmp/group-routing-unused-home" } }));
const mocks = vi.hoisted(() => ({ ensure: vi.fn(), request: vi.fn(), close: vi.fn() }));
vi.mock("@ai-devkit/daemon-client", async (original) => ({
  ...(await original<object>()),
  ensureDaemon: mocks.ensure,
}));
const group = { name: "team", members: ["one"], createdAt: "c", updatedAt: "u" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensure.mockResolvedValue({ request: mocks.request, close: mocks.close });
  mocks.request.mockResolvedValue(group);
});
describe("daemon-owned AgentGroupService", () => {
  it.each([
    ["create", ["team", ["one"]], "group.create", { name: "team", members: ["one"] }],
    ["update", ["team", ["one"]], "group.update", { name: "team", members: ["one"] }],
    ["addMember", ["team", "one"], "group.add", { name: "team", member: "one" }],
    ["removeMember", ["team", "one"], "group.remove_agent", { name: "team", member: "one" }],
    ["remove", ["team"], "group.remove", { name: "team" }],
    ["list", [], "group.list", {}],
    ["get", ["team"], "group.detail", { name: "team" }],
    ["lookup", ["team"], "group.lookup", { name: "team" }],
  ])("routes %s through the daemon", async (method, args, rpc, params) => {
    const service = new AgentGroupService();
    await (service as any)[method](...(args as any[]));
    expect(mocks.request).toHaveBeenCalledWith(rpc, params);
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it.each([
    ["not_found", AgentGroupNotFoundError],
    ["conflict", AgentGroupConflictError],
    ["invalid_name", AgentGroupInvalidNameError],
    ["invalid_member", AgentGroupInvalidMemberError],
    ["empty_members", AgentGroupEmptyMembersError],
    ["storage", AgentGroupStorageError],
  ])("maps %s to its existing domain category", async (code, ErrorType) => {
    mocks.request.mockRejectedValue(
      new DaemonRpcError("domain message", code, { name: "team", member: "one", path: "source" }),
    );
    await expect(new AgentGroupService().create("team", ["one"])).rejects.toBeInstanceOf(ErrorType);
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("fails when unavailable without reading legacy JSON", async () => {
    mocks.ensure.mockResolvedValue(null);
    await expect(new AgentGroupService().list()).rejects.toThrow(/daemon.*required/i);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("requires an upgrade for unsupported methods", async () => {
    mocks.request.mockRejectedValue(new DaemonRpcError("unknown method: group.list"));
    await expect(new AgentGroupService().list()).rejects.toThrow(/upgrade|restart/i);
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("surfaces transport failures without retry", async () => {
    mocks.request.mockRejectedValue(new Error("socket closed"));
    await expect(new AgentGroupService().list()).rejects.toThrow("socket closed");
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
