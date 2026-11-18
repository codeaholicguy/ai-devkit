import { DaemonRpcError, ensureDaemon, type AgentGroup } from "@ai-devkit/daemon-client";
export type { AgentGroup } from "@ai-devkit/daemon-client";

export class AgentGroupNotFoundError extends Error {
  constructor(public groupName: string) {
    super(`Agent group "${groupName}" not found.`);
    this.name = "AgentGroupNotFoundError";
  }
}

export class AgentGroupConflictError extends Error {
  constructor(public groupName: string) {
    super(`Agent group "${groupName}" already exists.`);
    this.name = "AgentGroupConflictError";
  }
}

export class AgentGroupInvalidNameError extends Error {
  constructor(public groupName: string) {
    super(`Invalid agent group name "${groupName}".`);
    this.name = "AgentGroupInvalidNameError";
  }
}

export class AgentGroupInvalidMemberError extends Error {
  constructor(
    public member: string,
    message?: string,
  ) {
    super(message ?? `Invalid agent group member "${member}".`);
    this.name = "AgentGroupInvalidMemberError";
  }
}

export class AgentGroupEmptyMembersError extends Error {
  constructor() {
    super("Agent group must contain at least one member.");
    this.name = "AgentGroupEmptyMembersError";
  }
}

export class AgentGroupStorageError extends Error {
  constructor(
    public filePath: string,
    message: string,
  ) {
    super(`Failed to read agent groups from "${filePath}": ${message}`);
    this.name = "AgentGroupStorageError";
  }
}

/** Daemon-owned groups. No local persistence or fallback after ownership. */
export class AgentGroupService {
  async list(): Promise<AgentGroup[]> {
    return this.call("group.list", {});
  }
  async get(name: string): Promise<AgentGroup> {
    return this.call("group.detail", { name });
  }
  async lookup(name: string): Promise<AgentGroup> {
    return this.call("group.lookup", { name });
  }
  async create(name: string, members: string[]): Promise<AgentGroup> {
    return this.call("group.create", { name, members });
  }
  async update(name: string, members: string[]): Promise<AgentGroup> {
    return this.call("group.update", { name, members });
  }
  async addMember(name: string, member: string): Promise<AgentGroup> {
    return this.call("group.add", { name, member });
  }
  async removeMember(name: string, member: string): Promise<AgentGroup> {
    return this.call("group.remove_agent", { name, member });
  }
  async remove(name: string): Promise<void> {
    await this.call("group.remove", { name });
  }

  private async call<T>(
    method: string,
    params: { name?: string; member?: string; members?: string[] },
  ): Promise<T> {
    const daemon = await ensureDaemon();
    if (!daemon)
      throw new Error(
        "A running, capable daemon is required for agent groups. Start devkitd and retry.",
      );
    try {
      return (await daemon.request(method, params)) as T;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("unknown method")) {
        throw new Error("Upgrade and restart devkitd to use agent groups.");
      }
      if (!(error instanceof DaemonRpcError)) throw error;
      const details = error.details as
        | { name?: string; member?: string; path?: string }
        | undefined;
      const name = details?.name ?? params.name ?? "";
      let mapped: Error;
      switch (error.code) {
        case "not_found":
          mapped = new AgentGroupNotFoundError(name);
          break;
        case "conflict":
          mapped = new AgentGroupConflictError(name);
          break;
        case "invalid_name":
          mapped = new AgentGroupInvalidNameError(name);
          break;
        case "invalid_member":
          mapped = new AgentGroupInvalidMemberError(
            details?.member ?? params.member ?? "",
            error.message,
          );
          break;
        case "empty_members":
          mapped = new AgentGroupEmptyMembersError();
          break;
        case "storage":
          mapped = new AgentGroupStorageError(details?.path ?? "daemon.db", error.message);
          break;
        default:
          throw error;
      }
      mapped.message = error.message;
      throw mapped;
    } finally {
      daemon.close();
    }
  }
}

export function createDefaultAgentGroupService(): AgentGroupService {
  return new AgentGroupService();
}
