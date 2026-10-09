import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import type { EnrichedAgent } from "./gen/EnrichedAgent.js";
import type { Event } from "./gen/Event.js";

/** Wire event pushed by the daemon — generated from devkit-core via ts-rs. */
export type DaemonEvent = Event;

export function daemonSocketPath(): string {
  return path.join(os.homedir(), ".ai-devkit", "daemon.sock");
}

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

  request(method: string, params: unknown = {}): Promise<unknown> {
    if (!this.socket) return Promise.reject(new Error("not connected"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      // A dead-but-unreported socket or a wedged daemon must not leave
      // callers awaiting forever.
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`daemon request "${method}" timed out`));
        }
      }, this.requestTimeoutMs);
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
      if (msg.error) p.reject(new Error(String(msg.error)));
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
