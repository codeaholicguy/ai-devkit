import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as os from "node:os";
import * as path from "node:path";
import { updateRegistry } from "./session-registry.js";

function registryFile(): string {
  return path.join(os.homedir(), ".pi", "agent", "sessions.json");
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const file = registryFile();
    updateRegistry(file, (registry) => {
      registry[String(process.pid)] = ctx.sessionManager.getSessionFile() ?? "ephemeral";
    });
  });

  pi.on("session_shutdown", async (_event, _ctx) => {
    const file = registryFile();
    updateRegistry(file, (registry) => {
      delete registry[String(process.pid)];
    });
  });
}
