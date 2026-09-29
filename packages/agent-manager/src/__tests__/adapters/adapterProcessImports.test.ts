/**
 * Guard (#257): built-in adapters must discover processes through the shared
 * async snapshot (AgentDetectionContext / captureProcessSnapshot), never the
 * synchronous listAgentProcesses / enrichProcesses helpers, which block the
 * event loop with execFileSync on every refresh.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADAPTER_DIRS = ["adapters", "harnesses"];
const SYNC_HELPERS = ["listAgentProcesses", "enrichProcesses"];

function listSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

/** Names imported by `import { ... } from "<utils/process or utils/index>"`. */
function importedUtilNames(source: string): string[] {
  const names: string[] = [];
  const importRe = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(importRe)) {
    if (!/\/utils(\/(process|index)(\.js)?)?$/.test(match[2])) continue;
    for (const spec of match[1].split(",")) {
      const name = spec
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0];
      if (name) names.push(name);
    }
  }
  return names;
}

describe("adapter process discovery guard", () => {
  it("finds adapter source files to check", () => {
    const files = ADAPTER_DIRS.flatMap((dir) => listSourceFiles(path.join(SRC_DIR, dir)));
    expect(files.some((file) => file.endsWith("AntigravityCliAdapter.ts"))).toBe(true);
  });

  it("no adapter imports the synchronous process helpers", () => {
    const offenders = ADAPTER_DIRS.flatMap((dir) => listSourceFiles(path.join(SRC_DIR, dir)))
      .flatMap((file) =>
        importedUtilNames(fs.readFileSync(file, "utf-8"))
          .filter((name) => SYNC_HELPERS.includes(name))
          .map((name) => `${path.relative(SRC_DIR, file)}: ${name}`),
      )
      .sort();

    expect(offenders).toEqual([]);
  });
});
