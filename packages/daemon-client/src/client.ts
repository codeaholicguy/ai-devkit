import type { DurableAgentWire } from "./gen/DurableAgentWire.js";
import type { DurableRunWire } from "./gen/DurableRunWire.js";
import type { AgentGroup } from "./gen/AgentGroup.js";
import type { GroupNameParams } from "./gen/GroupNameParams.js";
import type { GroupMembersParams } from "./gen/GroupMembersParams.js";
import type { GroupMemberParams } from "./gen/GroupMemberParams.js";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentStartParams } from "./gen/AgentStartParams.js";
import type { AgentStartResult } from "./gen/AgentStartResult.js";
import type { AgentLookupParams } from "./gen/AgentLookupParams.js";
import type { AgentLookupResult } from "./gen/AgentLookupResult.js";
import type { AgentNameParams } from "./gen/AgentNameParams.js";
import type { AgentUnregisterResult } from "./gen/AgentUnregisterResult.js";
import type { AgentRenameParams } from "./gen/AgentRenameParams.js";
import type { AgentRenameResult } from "./gen/AgentRenameResult.js";
import type { EnrichedAgent } from "./gen/EnrichedAgent.js";
import type { Event } from "./gen/Event.js";

/** Wire event pushed by the daemon — generated from devkit-core via ts-rs. */
export type DaemonEvent = Event;

/**
 * RPC error with the daemon's structured `code`/`details` when present.
 * `code` is undefined for old daemons and local transport failures.
 */
export class DaemonRpcError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "DaemonRpcError";
  }
}

export function daemonSocketPath(): string {
  return path.join(os.homedir(), ".ai-devkit", "daemon.sock");
}

export interface DurableCreateParams {
  name: string;
  provider?: "claude" | "codex" | "pi";
  cwd: string;
}
export interface DurableLaunchResult {
  agent: DurableAgentWire;
  runId: string;
}
export interface DurableRunDetail {
  agent: DurableAgentWire;
  run: DurableRunWire | null;
}
export type DurableResolution = DurableAgentWire | DurableAgentWire[] | null;

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Line-delimited JSON-RPC client for devkitd. One request per line;
 * events arrive as `{"event": {...}}` frames after `subscribe`.
 */
export class DaemonClient {
  private socket: net.Socket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private buffer = "";
  private onEvent: ((e: DaemonEvent) => void) | null = null;
  /**
   * Fires once when the socket dies after a successful connect (daemon
   * restart, crash). Consoles use it to resubscribe instead of silently
   * falling back to polling forever.
   */
  onDisconnect: (() => void) | null = null;

  private constructor(
    private socketPath: string,
    private requestTimeoutMs = 30_000,
  ) {}

  static connect(
    socketPath = daemonSocketPath(),
    timeoutMs = 1500,
    requestTimeoutMs = 30_000,
  ): Promise<DaemonClient> {
    return new Promise((resolve, reject) => {
      const client = new DaemonClient(socketPath, requestTimeoutMs);
      const socket = net.createConnection(socketPath);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("daemon connect timeout"));
      }, timeoutMs);
      socket.once("connect", () => {
        clearTimeout(timer);
        client.socket = socket;
        socket.on("data", (d) => client.onData(d));
        // Persistent listeners — a once("error") handler would be consumed
        // by the first error, leaving later ones unhandled (which crashes
        // the process). Both paths drain pending and notify onDisconnect.
        socket.on("error", (e) => client.onSocketDead(e));
        socket.on("close", () => client.onSocketDead(new Error("daemon socket closed")));
        resolve(client);
      });
      socket.once("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  /** Null when the socket is absent/unreachable — callers fall back. */
  static async tryConnect(socketPath = daemonSocketPath()): Promise<DaemonClient | null> {
    try {
      return await DaemonClient.connect(socketPath);
    } catch {
      return null;
    }
  }

  request(method: string, params: unknown = {}, timeoutMs?: number): Promise<unknown> {
    if (!this.socket) return Promise.reject(new Error("not connected"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      // A dead-but-unreported socket or a wedged daemon must not leave
      // callers awaiting forever.
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`daemon request "${method}" timed out`));
        }
      }, timeoutMs ?? this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket!.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }

  async subscribe(
    handler: (e: DaemonEvent) => void,
    opts: { afterSeq?: number; liveOnly?: boolean } = {},
  ): Promise<void> {
    this.onEvent = handler;
    await this.request("subscribe", { afterSeq: opts.afterSeq ?? 0, liveOnly: opts.liveOnly });
  }

  /**
   * The daemon's fully attributed agent list — authoritative for every
   * harness type the daemon serves. Throws on RPC error: callers fall back
   * to local adapters for the whole call, not per-agent.
   */
  async listAgents(): Promise<EnrichedAgent[]> {
    return (await this.request("agent.list")) as EnrichedAgent[];
  }

  /**
   * Daemon-side agent start — the daemon validates, spawns via the selected
   * runtime, registers the agent, and emits agent.started. The request
   * timeout covers the pid-resolution deadline plus a margin.
   */
  async startAgent(params: AgentStartParams): Promise<AgentStartResult> {
    const timeoutMs = Number(params.timeoutMs ?? 15_000) + 15_000;
    return (await this.request("agent.start", params, timeoutMs)) as AgentStartResult;
  }

  /**
   * Resolve an exact registered name to its location data (pid, runtime,
   * runtimeRef, cwd, liveness). Dead/tombstoned registrations resolve with
   * `alive: false`; unknown names reject with `DaemonRpcError` code
   * `not_found`. Generic on purpose — kill, send, open, channel and console
   * all drive their runtime ops from this payload.
   */
  async lookupAgent(
    name: string,
    options?: Omit<AgentLookupParams, "name">,
  ): Promise<AgentLookupResult> {
    return (await this.request("agent.lookup", {
      name,
      ...options,
    } satisfies AgentLookupParams)) as AgentLookupResult;
  }

  /**
   * Remove a name's registration outright (no tombstone) so the name is free
   * for the next start. Does not touch the runtime — teardown is the
   * caller's job, using `lookupAgent` data. Rejects `not_found` if unknown.
   */
  async unregisterAgent(name: string): Promise<AgentUnregisterResult> {
    return (await this.request("agent.unregister", {
      name,
    } satisfies AgentNameParams)) as AgentUnregisterResult;
  }

  /**
   * Rename a registered agent and its runtime handle (tmux session / live
   * herdr agent) atomically, daemon-side. Rejects coded `not_found`,
   * `name_in_use`, `runtime_rename_failed` (registry left unchanged),
   * `runtime_unavailable`, `invalid_params`.
   */
  async renameAgent(from: string, to: string): Promise<AgentRenameResult> {
    return (await this.request("agent.rename", {
      from,
      to,
    } satisfies AgentRenameParams)) as AgentRenameResult;
  }

  async durableCapabilities(): Promise<{ version: number; owner: string }> {
    return (await this.request("durable.capabilities")) as { version: number; owner: string };
  }
  async createDurable(params: DurableCreateParams): Promise<DurableAgentWire> {
    return (await this.request("durable.create", params)) as DurableAgentWire;
  }
  async listDurable(): Promise<DurableAgentWire[]> {
    return (await this.request("durable.list")) as DurableAgentWire[];
  }
  async showDurable(reference: string): Promise<DurableResolution>;
  async showDurable(reference: string, runId: string): Promise<DurableRunDetail>;
  async showDurable(
    reference: string,
    runId?: string,
  ): Promise<DurableResolution | DurableRunDetail> {
    return (await this.request("durable.show", { reference, runId })) as
      | DurableResolution
      | DurableRunDetail;
  }
  async sendDurable(id: string, prompt: string): Promise<DurableLaunchResult> {
    return (await this.request("durable.send", { id, prompt })) as DurableLaunchResult;
  }
  async runDurable(id: string, prompt: string): Promise<DurableLaunchResult> {
    return (await this.request("durable.run", { id, prompt })) as DurableLaunchResult;
  }
  async stopDurable(id: string, runId?: string): Promise<DurableAgentWire> {
    return (await this.request("durable.stop", { id, runId })) as DurableAgentWire;
  }

  async createGroup(name: string, members: string[]): Promise<AgentGroup> {
    return (await this.request("group.create", {
      name,
      members,
    } satisfies GroupMembersParams)) as AgentGroup;
  }
  async updateGroup(name: string, members: string[]): Promise<AgentGroup> {
    return (await this.request("group.update", {
      name,
      members,
    } satisfies GroupMembersParams)) as AgentGroup;
  }
  async addGroupMember(name: string, member: string): Promise<AgentGroup> {
    return (await this.request("group.add", {
      name,
      member,
    } satisfies GroupMemberParams)) as AgentGroup;
  }
  async removeGroupMember(name: string, member: string): Promise<AgentGroup> {
    return (await this.request("group.remove_agent", {
      name,
      member,
    } satisfies GroupMemberParams)) as AgentGroup;
  }
  async removeGroup(name: string): Promise<{ ok: boolean }> {
    return (await this.request("group.remove", { name } satisfies GroupNameParams)) as {
      ok: boolean;
    };
  }
  async listGroups(): Promise<AgentGroup[]> {
    return (await this.request("group.list", {})) as AgentGroup[];
  }
  async getGroup(name: string): Promise<AgentGroup> {
    return (await this.request("group.detail", { name } satisfies GroupNameParams)) as AgentGroup;
  }
  async lookupGroup(name: string): Promise<AgentGroup> {
    return (await this.request("group.lookup", { name } satisfies GroupNameParams)) as AgentGroup;
  }

  private onData(chunk: Buffer) {
    this.buffer += chunk.toString("utf8");
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (!line.trim()) continue;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.event) {
        this.onEvent?.(msg.event as DaemonEvent);
        continue;
      }
      const id = msg.id as number;
      const p = this.pending.get(id);
      if (!p) continue;
      this.pending.delete(id);
      clearTimeout(p.timer);
      if (msg.error)
        p.reject(
          new DaemonRpcError(String(msg.error), msg.code as string | undefined, msg.details),
        );
      else p.resolve(msg.result);
    }
  }

  /** Reject every in-flight request and mark the socket dead. Idempotent. */
  private onSocketDead(err: Error) {
    if (!this.socket) return;
    this.socket = null;
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const p of pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.onDisconnect?.();
  }

  close() {
    if (!this.socket) return;
    const socket = this.socket;
    this.socket = null;
    socket.destroy();
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const p of pending) {
      clearTimeout(p.timer);
      p.reject(new Error("client closed"));
    }
  }
}
