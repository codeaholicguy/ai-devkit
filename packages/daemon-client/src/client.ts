import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import type { Event } from "./gen/Event.js";

/** Wire event pushed by the daemon — generated from devkit-core via ts-rs. */
export type DaemonEvent = Event;

export function daemonSocketPath(): string {
  return path.join(os.homedir(), ".ai-devkit", "daemon.sock");
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
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

  private constructor(private socketPath: string) {}

  static connect(socketPath = daemonSocketPath(), timeoutMs = 1500): Promise<DaemonClient> {
    return new Promise((resolve, reject) => {
      const client = new DaemonClient(socketPath);
      const socket = net.createConnection(socketPath);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("daemon connect timeout"));
      }, timeoutMs);
      socket.once("connect", () => {
        clearTimeout(timer);
        client.socket = socket;
        socket.on("data", (d) => client.onData(d));
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
      this.pending.set(id, { resolve, reject });
      this.socket!.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }

  async subscribe(handler: (e: DaemonEvent) => void, afterSeq = 0): Promise<void> {
    this.onEvent = handler;
    await this.request("subscribe", { afterSeq });
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
      if (msg.error) p.reject(new Error(String(msg.error)));
      else p.resolve(msg.result);
    }
  }

  close() {
    this.socket?.destroy();
    this.socket = null;
  }
}

/** Convenience one-shot: connect, request, close. Null on unreachable. */
export async function connectDaemon(): Promise<DaemonClient | null> {
  return DaemonClient.tryConnect();
}
