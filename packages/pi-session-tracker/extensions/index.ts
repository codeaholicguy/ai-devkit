import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as net from "node:net";

type SessionRegistry = Record<string, string>;

const registryFile = path.join(os.homedir(), ".pi", "agent", "sessions.json");
const daemonSock = path.join(os.homedir(), ".ai-devkit", "daemon.sock");

function readRegistry(): SessionRegistry {
  try {
    return JSON.parse(fs.readFileSync(registryFile, "utf8"));
  } catch {
    return {};
  }
}

function writeRegistry(data: SessionRegistry): void {
  fs.mkdirSync(path.dirname(registryFile), { recursive: true });
  fs.writeFileSync(registryFile, JSON.stringify(data, null, 2), "utf8");
}

// Daemon-first store: when devkitd is listening, registry entries go through
// its sole-writer SQLite — two pi agents starting together can't lose entries.
// Falls back to the legacy sessions.json RMW when the daemon is absent.
function daemonRequest(method: string, params: Record<string, unknown>): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(daemonSock);
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1000);
    socket.once("connect", () => {
      socket.write(JSON.stringify({ id: 1, method, params }) + "\n");
    });
    socket.once("data", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const pid = String(process.pid);
    const sessionFile = ctx.sessionManager.getSessionFile() ?? "ephemeral";

    const viaDaemon = await daemonRequest("registry.put", {
      scope: "pi-sessions",
      name: pid,
      value: sessionFile,
    });
    if (!viaDaemon) {
      const registry = readRegistry();
      registry[pid] = sessionFile;
      writeRegistry(registry);
    }
  });

  pi.on("session_shutdown", async (_event, _ctx) => {
    const pid = String(process.pid);

    const viaDaemon = await daemonRequest("registry.delete", {
      scope: "pi-sessions",
      name: pid,
    });
    if (!viaDaemon) {
      const registry = readRegistry();
      delete registry[pid];
      writeRegistry(registry);
    }
  });
}
