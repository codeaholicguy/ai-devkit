import {
  DaemonRpcError,
  ensureDaemon,
  type AgentGroup,
  type DaemonClient,
} from "@ai-devkit/daemon-client";
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

export interface AgentGroupServiceOptions {
  client?: DaemonClient;
  onDebug?: (msg: string) => void;
}

function mapGroupRpcError(error: unknown, context: { name?: string; member?: string }): unknown {
  if (error instanceof Error && error.message.startsWith("unknown method")) {
    return new Error("Upgrade and restart devkitd to use agent groups.");
  }
  if (!(error instanceof DaemonRpcError)) return error;

  const details = error.details as { name?: string; member?: string; path?: string } | undefined;
  const name = details?.name ?? context.name ?? "";
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
        details?.member ?? context.member ?? "",
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
      return error;
  }
  mapped.message = error.message;
  return mapped;
}

/** Daemon-owned groups. No local persistence or fallback after ownership. */
export class AgentGroupService {
  constructor(private readonly options?: AgentGroupServiceOptions) {}

  async list(): Promise<AgentGroup[]> {
    return this.withDaemon("group.list", (daemon) => daemon.listGroups(), {});
  }
  async get(name: string): Promise<AgentGroup> {
    return this.withDaemon("group.detail", (daemon) => daemon.getGroup(name), { name });
  }
  async lookup(name: string): Promise<AgentGroup> {
    return this.withDaemon("group.lookup", (daemon) => daemon.lookupGroup(name), { name });
  }
  async create(name: string, members: string[]): Promise<AgentGroup> {
    return this.withDaemon("group.create", (daemon) => daemon.createGroup(name, members), { name });
  }
  async update(name: string, members: string[]): Promise<AgentGroup> {
    return this.withDaemon("group.update", (daemon) => daemon.updateGroup(name, members), { name });
  }
  async addMember(name: string, member: string): Promise<AgentGroup> {
    return this.withDaemon("group.add", (daemon) => daemon.addGroupMember(name, member), {
      name,
      member,
    });
  }
  async removeMember(name: string, member: string): Promise<AgentGroup> {
    return this.withDaemon(
      "group.remove_agent",
      (daemon) => daemon.removeGroupMember(name, member),
      { name, member },
    );
  }
  async remove(name: string): Promise<void> {
    await this.withDaemon("group.remove", (daemon) => daemon.removeGroup(name), { name });
  }

  private async withDaemon<T>(
    method: string,
    operation: (daemon: DaemonClient) => Promise<T>,
    context: { name?: string; member?: string },
  ): Promise<T> {
    const debug = this.options?.onDebug;
    const owned = !this.options?.client;
    const daemon =
      this.options?.client ?? (await ensureDaemon(debug ? { onDebug: debug } : undefined));
    if (!daemon) {
      debug?.(`no daemon available for ${method}; refusing legacy JSON fallback`);
      throw new Error(
        "A running, capable daemon is required for agent groups. Start devkitd and retry.",
      );
    }
    debug?.(`daemon path: calling ${method}`);
    try {
      return await operation(daemon);
    } catch (error) {
      if (error instanceof DaemonRpcError && error.code) {
        debug?.(`daemon ${method} returned coded error ${error.code}`);
      } else if (error instanceof Error) {
        debug?.(`daemon ${method} failed: ${error.message}`);
      }
      throw mapGroupRpcError(error, context);
    } finally {
      if (owned) daemon.close();
    }
  }
}

export function createDefaultAgentGroupService(
  options?: AgentGroupServiceOptions,
): AgentGroupService {
  return new AgentGroupService(options);
}
