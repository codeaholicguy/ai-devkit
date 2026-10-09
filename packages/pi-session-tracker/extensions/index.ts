import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

type SessionRegistry = Record<string, string>;

const registryFile = path.join(os.homedir(), ".pi", "agent", "sessions.json");

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

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const pid = String(process.pid);
    const sessionFile = ctx.sessionManager.getSessionFile() ?? "ephemeral";

    const registry = readRegistry();
    registry[pid] = sessionFile;
    writeRegistry(registry);
  });

  pi.on("session_shutdown", async (_event, _ctx) => {
    const pid = String(process.pid);

    const registry = readRegistry();
    delete registry[pid];
    writeRegistry(registry);
  });
}
