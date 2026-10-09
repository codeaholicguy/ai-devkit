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
import Database from "better-sqlite3";
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
  // session-state/<id>/{inuse.*.lock,events.jsonl,workspace.yaml} — the lock
  // files drive attribution, so the whole tree must materialize on replay.
  copilot: [".copilot/session-state"],
  grok_cli: [".grok/sessions"],
  // session_locks/<slug>.lock — pid-holder files read on every detect.
  devin: [".local/share/devin/cli/session_locks"],
  // sessions/cli/<id>.{lock,json,jsonl} — locks drive attribution; the
  // whole flat dir is lightweight enough for index-style capture.
  kiro: [".kiro/sessions/cli"],
  // antigravity-cli/{cache,brain} — last_conversations.json (small .json
  // aux) plus only the transcripts referenced by matched agents; the
  // brain tree is tens of MB so it stays referenced-only (not index).
  antigravity_cli: [".gemini/antigravity-cli"],
};

/**
 * Dirs captured wholesale (lock/index trees where every file matters —
 * copilot lock dirs, kiro/devin locks, the codex mapping dir, the gemini
 * tmp tree). Everything else captures agent-referenced session files
 * plus small .json aux files.
 */
const HARNESS_INDEX_DIRS = new Set([
  ".gemini/tmp",
  ".copilot/session-state",
  ".codex/ai-devkit",
  ".local/share/devin/cli/session_locks",
  ".kiro/sessions/cli",
]);

/** Individual files (not dirs) each harness consults during detection. */
const HARNESS_FILES: Record<string, string[]> = {
  pi: [".pi/agent/sessions.json"],
  grok_cli: [".grok/active_sessions.json"],
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
): { home: Record<string, string>; mtimes: Record<string, number> } {
  const home: Record<string, string> = {};
  const mtimes: Record<string, number> = {};
  const referenced = new Set(
    agents.map((a) => a.sessionFilePath).filter((p): p is string => Boolean(p)),
  );

  const put = (rel: string, file: string) => {
    home[rel] = sanitize(fs.readFileSync(file, "utf8"), realHome);
    // Real mtimes are captured too — adapters that read them (Grok
    // lastActive, latest-session pick) replay deterministically.
    mtimes[rel] = fs.statSync(file).mtimeMs;
  };

  for (const relDir of HARNESS_DIRS[adapterType] ?? []) {
    const dir = path.join(realHome, relDir);
    if (!fs.existsSync(dir)) continue;
    // Session trees can hold months of transcripts; files that produced no
    // agent cannot influence replayed output, so only agent-referenced
    // session files plus small aux/index files are copied.
    const isIndexDir = HARNESS_INDEX_DIRS.has(relDir);
    walk(dir, (file) => {
      const rel = path.join(relDir, path.relative(dir, file));
      const isAuxIndex = rel.endsWith("sessions.json") || rel.endsWith(".json");
      if (isIndexDir || referenced.has(file) || (isAuxIndex && fileSize(file) < 64 * 1024)) {
        put(rel, file);
      }
    });
  }
  for (const relFile of HARNESS_FILES[adapterType] ?? []) {
    const file = path.join(realHome, relFile);
    if (fs.existsSync(file) && fileSize(file) < 64 * 1024) {
      put(relFile, file);
    }
  }
  return { home, mtimes };
}

/**
 * SQLite stores adapters consult (OpenCode's opencode.db). Sessions are
 * reachable only through captured processes' cwds, so the dump keeps the
 * table DDL plus every session row for those directories and their
 * message/part rows — replay answers identical queries against the same
 * view. Rows are serialized as executable SQL (binary dbs can't travel in
 * the JSON `home` map); the key is the canonical `~/.local/share` relpath,
 * which replay pins via XDG_DATA_HOME.
 */
function collectSqliteDumps(
  adapterType: string,
  realHome: string,
  processes: { cwd?: string | null }[],
): Record<string, string[]> {
  const share = process.env.XDG_DATA_HOME || path.join(realHome, ".local", "share");
  if (adapterType === "opencode") {
    return dumpSqliteDb(
      path.join(share, "opencode", "opencode.db"),
      ".local/share/opencode/opencode.db",
      realHome,
      (dump) => {
        const dirs = uniqueCwds(processes);
        if (dirs.length === 0) return;
        const sessions = dump.rows("session", `WHERE directory IN ${dump.inList(dirs)} ORDER BY rowid`, dirs);
        const sids = sessions.map((s) => s.id);
        dump.insertRows("session", sessions);
        if (sids.length === 0) return;
        dump.insertRows("message", dump.rows("message", `WHERE session_id IN ${dump.inList(sids)} ORDER BY rowid`, sids));
        dump.insertRows("part", dump.rows("part", `WHERE session_id IN ${dump.inList(sids)} ORDER BY rowid`, sids));
      },
      ["session", "message", "part"],
    );
  }
  if (adapterType === "devin") {
    const dbPath = path.join(share, "devin", "cli", "sessions.db");
    // Locks are captured separately as text files; slugs here widen the
    // session row set so lock-slug lookups resolve identically on replay.
    const lockSids = fs.existsSync(path.join(path.dirname(dbPath), "session_locks"))
      ? fs
          .readdirSync(path.join(path.dirname(dbPath), "session_locks"))
          .filter((f) => f.endsWith(".lock"))
          .map((f) => f.slice(0, -".lock".length))
          .filter(Boolean)
      : [];
    return dumpSqliteDb(
      dbPath,
      ".local/share/devin/cli/sessions.db",
      realHome,
      (dump) => {
        const dirs = uniqueCwds(processes);
        const clauses: string[] = [];
        const args: unknown[] = [];
        if (dirs.length) {
          clauses.push(`working_directory IN ${dump.inList(dirs)}`);
          args.push(...dirs);
        }
        if (lockSids.length) {
          clauses.push(`id IN ${dump.inList(lockSids)}`);
          args.push(...lockSids);
        }
        const sessions = clauses.length ? dump.rows("sessions", `WHERE ${clauses.join(" OR ")} ORDER BY rowid`, args) : [];
        const sids = sessions.map((s) => s.id);
        dump.insertRows("sessions", sessions);
        if (sids.length === 0) return;
        // Only the rows getSessionStats can reach: the frontier node, the
        // MAX(created_at) node, the 8 newest role='user' nodes, and the
        // newest non-shell non-slash prompt — identical query results on
        // replay without hauling full transcripts into the bundle.
        for (const sid of sids) {
          const reachable = [
            ...dump.rows("message_nodes", "WHERE session_id = ? ORDER BY node_id DESC LIMIT 1", [sid]),
            // The newest-created_at row — `MAX(created_at)` reads only the
            // value, and `= MAX(...)` unbounded explodes when batch-written
            // nodes share a timestamp.
            ...dump.rows("message_nodes", "WHERE session_id = ? ORDER BY created_at DESC, node_id DESC LIMIT 1", [sid]),
            ...dump.rows(
              "message_nodes",
              "WHERE session_id = ? AND json_extract(chat_message, '$.role') = 'user' ORDER BY node_id DESC LIMIT 8",
              [sid],
            ),
          ];
          const seen = new Set<unknown>();
          dump.insertRows(
            "message_nodes",
            reachable.filter((r) => (seen.has(r.node_id) ? false : (seen.add(r.node_id), true))),
          );
          dump.insertRows(
            "prompt_history",
            dump.rows(
              "prompt_history",
              "WHERE session_id = ? AND is_shell = 0 AND content NOT LIKE '/%' ORDER BY timestamp DESC LIMIT 1",
              [sid],
            ),
          );
        }
      },
      ["sessions", "message_nodes", "prompt_history"],
    );
  }
  return {};
}

function uniqueCwds(processes: { cwd?: string | null }[]): string[] {
  return [...new Set(processes.map((p) => p.cwd).filter((c): c is string => Boolean(c)))];
}

/**
 * Dump `dbPath`'s tables (DDL + caller-selected rows) as executable SQL,
 * keyed under `relKey`. `fill` receives helpers that append INSERTs for
 * the rows the adapter's detection can reach.
 */
function dumpSqliteDb(
  dbPath: string,
  relKey: string,
  realHome: string,
  fill: (dump: {
    inList: (xs: unknown[]) => string;
    rows: (table: string, where: string, args: unknown[]) => Record<string, unknown>[];
    insertRows: (table: string, rs: Record<string, unknown>[]) => void;
  }) => void,
  tables: string[],
): Record<string, string[]> {
  if (!fs.existsSync(dbPath)) return {};
  const db = new Database(dbPath, { readonly: true });
  try {
    const stmts = (
      db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name IN (${tables.map(() => "?").join(",")})`,
        )
        .all(...tables) as { sql: string }[]
    ).map((r) => `${r.sql};`);
    const dump = {
      inList: (xs: unknown[]) => `(${xs.map(() => "?").join(",")})`,
      rows: (table: string, clause: string, args: unknown[]) =>
        db.prepare(`SELECT * FROM "${table}" ${clause}`).all(...args) as Record<
          string,
          unknown
        >[],
      insertRows: (table: string, rs: Record<string, unknown>[]) => {
        for (const r of rs) {
          stmts.push(
            `INSERT INTO "${table}" VALUES (${Object.values(r).map(sqlLit).join(",")});`,
          );
        }
      },
    };
    fill(dump);
    return { [relKey]: stmts.map((s) => sanitize(s, realHome)) };
  } finally {
    db.close();
  }
}

function sqlLit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (v instanceof Uint8Array) return `X'${Buffer.from(v).toString("hex")}'`;
  return `'${String(v).split("'").join("''")}'`;
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

  const { home, mtimes } = collectHomeFiles(adapter.type, realHome, agents);
  const sqlite = collectSqliteDumps(adapter.type, realHome, processes);
  const bundle: FixtureBundle = {
    adapter: adapter.type,
    capturedAt: new Date(frozenNow).toISOString(),
    frozenNow,
    processes: sanitize(processes, realHome),
    home,
    mtimes,
    registry,
    sqlite: Object.keys(sqlite).length > 0 ? sqlite : undefined,
    expected: normalizeAgents(agents, realHome),
  };

  const dir = path.join(FIXTURES_ROOT, adapter.type);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${caseName}.json`);
  fs.writeFileSync(out, JSON.stringify(bundle, null, 2));
  return out;
}
