/**
 * Capture a live fixture bundle for an adapter: snapshot the real process
 * list, run detectAgents with a frozen clock, and record expected output
 * plus the session files the detection touched.
 *
 * Run via `AI_DEVKIT_FIXTURE_CAPTURE=1 npx vitest run fixtures.capture`.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentAdapter, AgentInfo } from "../adapters/AgentAdapter.js";
import { AgentRegistry } from "../utils/AgentRegistry.js";
import { captureProcessSnapshot } from "../utils/process.js";
import { FixtureBundle, normalizeAgents, sanitize, withFrozenClock } from "./bundle.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export const FIXTURES_ROOT = path.join(repoRoot, "fixtures", "harness");

/** Session-file trees each harness consults during detection. */
const HARNESS_DIRS: Record<string, string[]> = {
  claude: [".claude/sessions", ".claude/projects"],
  codex: [".codex/sessions", ".codex/archived_sessions", ".codex/ai-devkit"],
  pi: [".pi/agent/sessions"],
  // tmp/<shortId>/{.project_root,chats/*} — small tree; index-style capture
  // keeps the ownership markers replay needs for slug-dir attribution.
  gemini_cli: [".gemini/tmp"],
};

/** Individual files (not dirs) each harness consults during detection. */
const HARNESS_FILES: Record<string, string[]> = {
  pi: [".pi/agent/sessions.json"],
};

/**
 * Copy the harness's session dirs into `home` — only files the detection
 * actually touched (referenced sessionFilePath) plus index/pid files.
 * Transcript trees can be large; we include full files only for sessions
 * that produced an agent, plus every file in lightweight index dirs.
 */
function collectHomeFiles(
  adapterType: string,
  realHome: string,
  agents: AgentInfo[],
): Record<string, string> {
  const home: Record<string, string> = {};
  const referenced = new Set(
    agents.map((a) => a.sessionFilePath).filter((p): p is string => Boolean(p)),
  );

  for (const relDir of HARNESS_DIRS[adapterType] ?? []) {
    const dir = path.join(realHome, relDir);
    if (!fs.existsSync(dir)) continue;
    // Session trees can hold months of transcripts; files that produced no
    // agent cannot influence replayed output, so only agent-referenced
    // session files plus small aux/index files are copied.
    const isIndexDir = !relDir.endsWith("projects") && !relDir.endsWith("sessions");
    walk(dir, (file) => {
      const rel = path.join(relDir, path.relative(dir, file));
      const isAuxIndex = rel.endsWith("sessions.json") || rel.endsWith(".json");
      if (isIndexDir || referenced.has(file) || (isAuxIndex && fileSize(file) < 64 * 1024)) {
        home[rel] = sanitize(fs.readFileSync(file, "utf8"), realHome);
      }
    });
  }
  for (const relFile of HARNESS_FILES[adapterType] ?? []) {
    const file = path.join(realHome, relFile);
    if (fs.existsSync(file) && fileSize(file) < 64 * 1024) {
      home[relFile] = sanitize(fs.readFileSync(file, "utf8"), realHome);
    }
  }
  return home;
}

/**
 * Registry rows keyed to captured pids — adapters' registry caches consult
 * them during detection, so replay must see the same view (otherwise
 * ordering/attribution diverges: cache hits precede locator matches).
 */
function collectRegistryEntries(
  realHome: string,
  processes: { pid: number }[],
): Record<string, unknown>[] {
  const pids = new Set(processes.map((p) => p.pid));
  try {
    return AgentRegistry.default()
      .list()
      .filter((e) => pids.has(e.pid))
      .map((e) => sanitize({ ...e }, realHome) as Record<string, unknown>);
  } catch {
    return [];
  }
}

function fileSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return Infinity;
  }
}

function walk(dir: string, visit: (file: string) => void, depth = 0) {
  if (depth > 4) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, visit, depth + 1);
    else if (entry.isFile()) visit(p);
  }
}

export async function captureLive(adapter: AgentAdapter, caseName = "live"): Promise<string> {
  const realHome = os.homedir();
  const frozenNow = Date.now();
  const names = adapter.processNames;
  if (!names?.length) {
    throw new Error(`adapter ${adapter.type} has no processNames — can't snapshot`);
  }

  const { processes, agents, registry } = await withFrozenClock(frozenNow, async () => {
    const snapshot = await captureProcessSnapshot([...names], {
      isCandidate: (p) => adapter.canHandle(p),
    });
    // Registry read must precede detection — detectAgents persists its own
    // results, which would poison the captured view.
    const registryBefore = collectRegistryEntries(realHome, snapshot);
    const detected = await adapter.detectAgents({ processes: snapshot });
    return { processes: snapshot, agents: detected, registry: registryBefore };
  });

  const bundle: FixtureBundle = {
    adapter: adapter.type,
    capturedAt: new Date(frozenNow).toISOString(),
    frozenNow,
    processes: sanitize(processes, realHome),
    home: collectHomeFiles(adapter.type, realHome, agents),
    registry,
    expected: normalizeAgents(agents, realHome),
  };

  const dir = path.join(FIXTURES_ROOT, adapter.type);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${caseName}.json`);
  fs.writeFileSync(out, JSON.stringify(bundle, null, 2));
  return out;
}
