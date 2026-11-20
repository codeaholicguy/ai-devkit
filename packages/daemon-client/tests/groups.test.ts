import { describe, it, expect, vi } from "vitest";
import { DaemonClient } from "../src/client.js";

describe("group RPC client", () => {
  it.each([
    ["createGroup", ["team", ["one"]], "group.create", { name: "team", members: ["one"] }],
    ["updateGroup", ["team", ["one"]], "group.update", { name: "team", members: ["one"] }],
    ["addGroupMember", ["team", "one"], "group.add", { name: "team", member: "one" }],
    ["removeGroupMember", ["team", "one"], "group.remove_agent", { name: "team", member: "one" }],
    ["removeGroup", ["team"], "group.remove", { name: "team" }],
    ["listGroups", [], "group.list", {}],
    ["getGroup", ["team"], "group.detail", { name: "team" }],
    ["lookupGroup", ["team"], "group.lookup", { name: "team" }],
  ])("%s uses the wire contract", async (method, args, rpc, params) => {
    const request = vi.fn().mockResolvedValue({ name: "team" });
    const client = Object.assign(Object.create(DaemonClient.prototype), { request });
    await client[method](...(args as any[]));
    expect(request).toHaveBeenCalledWith(rpc, params);
  });
});
