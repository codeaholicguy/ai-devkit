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
const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  close: vi.fn(),
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  addGroupMember: vi.fn(),
  removeGroupMember: vi.fn(),
  removeGroup: vi.fn(),
  listGroups: vi.fn(),
  getGroup: vi.fn(),
  lookupGroup: vi.fn(),
}));
vi.mock("@ai-devkit/daemon-client", async (original) => ({
  ...(await original<object>()),
  ensureDaemon: mocks.ensure,
}));
const group = { name: "team", members: ["one"], createdAt: "c", updatedAt: "u" };
function makeClient() {
  return {
    createGroup: mocks.createGroup,
    updateGroup: mocks.updateGroup,
    addGroupMember: mocks.addGroupMember,
    removeGroupMember: mocks.removeGroupMember,
    removeGroup: mocks.removeGroup,
    listGroups: mocks.listGroups,
    getGroup: mocks.getGroup,
    lookupGroup: mocks.lookupGroup,
    close: mocks.close,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensure.mockResolvedValue(makeClient());
  mocks.createGroup.mockResolvedValue(group);
  mocks.updateGroup.mockResolvedValue(group);
  mocks.addGroupMember.mockResolvedValue(group);
  mocks.removeGroupMember.mockResolvedValue(group);
  mocks.removeGroup.mockResolvedValue({ ok: true });
  mocks.listGroups.mockResolvedValue([group]);
  mocks.getGroup.mockResolvedValue(group);
  mocks.lookupGroup.mockResolvedValue(group);
});
describe("daemon-owned AgentGroupService", () => {
  it.each([
    ["create", ["team", ["one"]], "createGroup"],
    ["update", ["team", ["one"]], "updateGroup"],
    ["addMember", ["team", "one"], "addGroupMember"],
    ["removeMember", ["team", "one"], "removeGroupMember"],
    ["remove", ["team"], "removeGroup"],
    ["list", [], "listGroups"],
    ["get", ["team"], "getGroup"],
    ["lookup", ["team"], "lookupGroup"],
  ])("routes %s through the typed DaemonClient method %s", async (method, args, clientMethod) => {
    const service = new AgentGroupService();
    await (service as any)[method](...(args as any[]));
    expect((mocks as any)[clientMethod]).toHaveBeenCalledWith(...(args as any[]));
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("reuses a caller-owned client without closing it", async () => {
    const client = makeClient();
    const service = new AgentGroupService({ client: client as any });
    await service.lookup("team");
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.lookupGroup).toHaveBeenCalledWith("team");
    expect(mocks.close).not.toHaveBeenCalled();
  });
  it.each([
    ["not_found", AgentGroupNotFoundError],
    ["conflict", AgentGroupConflictError],
    ["invalid_name", AgentGroupInvalidNameError],
    ["invalid_member", AgentGroupInvalidMemberError],
    ["empty_members", AgentGroupEmptyMembersError],
    ["storage", AgentGroupStorageError],
  ])("maps %s to its existing domain category", async (code, ErrorType) => {
    mocks.createGroup.mockRejectedValue(
      new DaemonRpcError("domain message", code, { name: "team", member: "one", path: "source" }),
    );
    await expect(new AgentGroupService().create("team", ["one"])).rejects.toBeInstanceOf(ErrorType);
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("fails when unavailable without reading legacy JSON", async () => {
    mocks.ensure.mockResolvedValue(null);
    await expect(new AgentGroupService().list()).rejects.toThrow(/daemon.*required/i);
    expect(mocks.listGroups).not.toHaveBeenCalled();
  });
  it("requires an upgrade for unsupported methods", async () => {
    mocks.listGroups.mockRejectedValue(new DaemonRpcError("unknown method: group.list"));
    await expect(new AgentGroupService().list()).rejects.toThrow(/upgrade|restart/i);
    expect(mocks.listGroups).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("surfaces transport failures without retry", async () => {
    mocks.listGroups.mockRejectedValue(new Error("socket closed"));
    await expect(new AgentGroupService().list()).rejects.toThrow("socket closed");
    expect(mocks.listGroups).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
