import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

type SessionRegistry = Record<string, string>;

// pid → session file map that ai-devkit (CLI adapters and devkitd's sweep)
// reads to resolve which session a running pi process is on. Plain
// read-modify-write, the same model as the codex session-mapping hook: there
// is no daemon RPC path, so an entry can never be silently dropped by a
// daemon that does not implement it.
function registryFile(): string {
  return path.join(os.homedir(), ".pi", "agent", "sessions.json");
}

function readRegistry(file: string): SessionRegistry {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as SessionRegistry)
      : {};
  } catch {
    return {};
  }
}

// Write to a sibling temp file and rename so concurrent readers never see a
// truncated JSON document.
function writeRegistry(file: string, data: SessionRegistry): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const file = registryFile();
    const registry = readRegistry(file);
    registry[String(process.pid)] = ctx.sessionManager.getSessionFile() ?? "ephemeral";
    writeRegistry(file, registry);
  });

  pi.on("session_shutdown", async (_event, _ctx) => {
    const file = registryFile();
    const registry = readRegistry(file);
    delete registry[String(process.pid)];
    writeRegistry(file, registry);
  });
}
