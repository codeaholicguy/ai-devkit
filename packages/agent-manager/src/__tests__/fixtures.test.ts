/**
 * Fixture replay: materialize each committed bundle into a fake HOME,
 * run the adapter's detectAgents with the recorded processes + frozen
 * clock, and require byte-identical output to `expected`.
 *
 * The same bundles are consumed by devkit-harness Rust tests — this file is
 * the TS↔TS side of the parity oracle.
 */

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import Database from "better-sqlite3";
import { createBuiltinAdapters } from "../harnesses/index.js";
import { CodexAdapter } from "../harnesses/codex/CodexAdapter.js";
import { PiAdapter } from "../harnesses/pi/PiAdapter.js";
import { GeminiCliAdapter } from "../harnesses/gemini/GeminiCliAdapter.js";
import { CopilotAdapter } from "../harnesses/copilot/CopilotAdapter.js";
import { AgentRegistry, type RegistryEntry } from "../utils/AgentRegistry.js";
import { expand, expandNow, normalizeAgents, withFrozenClock } from "../fixtures/bundle.js";
import type { FixtureBundle } from "../fixtures/bundle.js";
import { captureLive, FIXTURES_ROOT } from "../fixtures/capture.js";

const bundlePaths = fs.existsSync(FIXTURES_ROOT)
  ? fs
      .readdirSync(FIXTURES_ROOT, { withFileTypes: true })
      .flatMap((d) =>
        d.isDirectory()
          ? fs
              .readdirSync(path.join(FIXTURES_ROOT, d.name))
              .filter((f) => f.endsWith(".json"))
              .map((f) => path.join(FIXTURES_ROOT, d.name, f))
          : [],
      )
  : [];

/** Adapters whose detect path consults AgentRegistry. */
const REGISTRY_AWARE = new Set(["codex", "pi", "gemini_cli", "copilot"]);

function adapterFor(type: string, registry?: AgentRegistry) {
  // Adapters that consult the registry during detection get the seeded
  // isolated instance so replay never reads real ~/.ai-devkit state.
  if (type === "codex" && registry) return new CodexAdapter(registry);
  if (type === "pi" && registry) return new PiAdapter(registry);
  if (type === "gemini_cli" && registry) return new GeminiCliAdapter(registry);
  if (type === "copilot" && registry) return new CopilotAdapter(registry);
  const adapter = createBuiltinAdapters().find((a) => a.type === type);
  if (!adapter) throw new Error(`no builtin adapter for "${type}"`);
  return adapter;
}

/** Seed an isolated registry at `<home>/.ai-devkit/agents.json`. */
function seedRegistry(bundle: FixtureBundle, home: string, nowIso: string): AgentRegistry | undefined {
  if (!REGISTRY_AWARE.has(bundle.adapter)) return undefined;
  const registry = new AgentRegistry(path.join(home, ".ai-devkit", "agents.json"));
  const entries = (bundle.registry ?? []).map(
    (e) =>
      ({
        name: "",
        type: bundle.adapter,
        runtime: "tmux",
        runtimeRef: null,
        cwd: "",
        startedAt: nowIso,
        sessionId: "",
        sessionFilePath: "",
        pinned: false,
        ...expand(expandNow(e as Record<string, unknown>, nowIso), home),
      }) as RegistryEntry,
  );
  registry.registerBatch(entries);
  return registry;
}

/** Materialize a bundle into a temp HOME; returns cleanup + replay inputs. */
function materialize(bundle: FixtureBundle) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "fixture-home-"));
  // "$TODAY" resolves to the local `YYYY/MM/DD` day key at write time — Codex
  // date-dir discovery derives day keys from process start times in local
  // time, so static dirs would drift across replay days/timezones.
  const now = new Date();
  const todayKey = [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("/");
  for (const [rel, content] of Object.entries(bundle.home)) {
    const p = path.join(home, expand(rel.split("$TODAY").join(todayKey), home));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, expand(content.split("$TODAY").join(todayKey), home));
  }
  // SQLite stores (OpenCode's opencode.db) materialize from ordered SQL
  // statements — binary dbs can't travel in the JSON `home` map.
  for (const [rel, stmts] of Object.entries(bundle.sqlite ?? {})) {
    const p = path.join(home, expand(rel.split("$TODAY").join(todayKey), home));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const db = new Database(p);
    try {
      for (const stmt of stmts) {
        db.exec(expand(stmt.split("$TODAY").join(todayKey), home));
      }
    } finally {
      db.close();
    }
  }
  // "$NOW" resolves to the instant home files were written — legacy
  // cwd+birthtime matching compares process start times against real file
  // creation times, so a static timestamp would drift out of tolerance.
  const nowIso = new Date().toISOString();
  // Deterministic mtimes for adapters that read them (Grok lastActive /
  // latest-session pick) — "$NOW" resolves like the process sentinel.
  for (const [rel, mt] of Object.entries(bundle.mtimes ?? {})) {
    const p = path.join(home, expand(rel.split("$TODAY").join(todayKey), home));
    const ms = mt === "$NOW" ? Date.parse(nowIso) : mt;
    fs.utimesSync(p, ms / 1000, ms / 1000);
  }
  // JSON round-tripped Date fields (e.g. ProcessInfo.startTime) come back as
  // ISO strings — adapters expect real Date instances.
  const processes = expandNow(expand(bundle.processes, home), nowIso).map((p) => ({
    ...p,
    startTime: p.startTime ? new Date(p.startTime) : undefined,
  }));
  const frozenNow = bundle.frozenNow === "$NOW" ? Date.parse(nowIso) : bundle.frozenNow;
  // Pids whose startTime resolves to the materialization instant — Codex
  // derives session day-dirs from start times, so only these paths contain
  // the replay-day key and normalize to $TODAY.
  const nowPids = new Set(
    bundle.processes.filter((p) => p.startTime === "$NOW").map((p) => p.pid),
  );
  return {
    home,
    processes,
    frozenNow,
    todayKey,
    // Only $NOW resolves — $FIXTURE_HOME and $TODAY stay literal to match
    // the normalized actual form.
    expected: expandNow(bundle.expected, nowIso),
    cleanup: () => fs.rmSync(home, { recursive: true, force: true }),
    nowIso,
    nowPids,
  };
}

describe("fixture replay (TS parity oracle)", () => {
  const saved = process.env.HOME;
  afterEach(() => {
    if (saved === undefined) delete process.env.HOME;
    else process.env.HOME = saved;
  });

  if (bundlePaths.length === 0) {
    it.todo("no fixture bundles committed yet — run AI_DEVKIT_FIXTURE_CAPTURE=1");
    return;
  }

  for (const bundlePath of bundlePaths) {
    it(`replays ${path.relative(FIXTURES_ROOT, bundlePath)}`, async () => {
      const bundle: FixtureBundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
      const { home, processes, frozenNow, expected, cleanup, todayKey, nowIso, nowPids } =
        materialize(bundle);
      // Pin XDG to the fixture's canonical share dir — an ambient
      // XDG_DATA_HOME would resolve the real opencode.db into replay.
      const savedXdg = process.env.XDG_DATA_HOME;
      // Same for ANTIGRAVITY_CLI_HOME — clearing it falls the adapter
      // back to the pinned HOME's canonical base dir.
      const savedAgy = process.env.ANTIGRAVITY_CLI_HOME;
      try {
        process.env.HOME = home;
        process.env.XDG_DATA_HOME = path.join(home, ".local", "share");
        delete process.env.ANTIGRAVITY_CLI_HOME;
        const registry = seedRegistry(bundle, home, nowIso);
        const agents = await withFrozenClock(frozenNow, () =>
          adapterFor(bundle.adapter, registry).detectAgents({ processes }),
        );
        // Day-key dirs normalize back to $TODAY only for agents whose
        // process startTime was $NOW — static-start agents keep concrete
        // dates so live bundles stay replayable on any day.
        const actual = JSON.parse(JSON.stringify(normalizeAgents(agents, home))).map((a) =>
          nowPids.has(a.pid)
            ? JSON.parse(JSON.stringify(a).split(todayKey).join("$TODAY"))
            : a,
        );
        expect(actual).toEqual(expected);
      } finally {
        if (savedXdg === undefined) delete process.env.XDG_DATA_HOME;
        else process.env.XDG_DATA_HOME = savedXdg;
        if (savedAgy === undefined) delete process.env.ANTIGRAVITY_CLI_HOME;
        else process.env.ANTIGRAVITY_CLI_HOME = savedAgy;
        cleanup();
      }
    });
  }
});

// Opt-in live capture: AI_DEVKIT_FIXTURE_CAPTURE=1 npx vitest run fixtures
describe.runIf(process.env.AI_DEVKIT_FIXTURE_CAPTURE === "1")("fixture capture (live)", () => {
  it("captures claude bundle from the live machine", async () => {
    const out = await captureLive(adapterFor("claude"), "live");
    expect(fs.existsSync(out)).toBe(true);
  }, 30000);

  it("captures codex bundle from the live machine", async () => {
    const out = await captureLive(adapterFor("codex"), "live");
    expect(fs.existsSync(out)).toBe(true);
  }, 30000);

  it("captures pi bundle from the live machine", async () => {
    const out = await captureLive(adapterFor("pi"), "live");
    expect(fs.existsSync(out)).toBe(true);
  }, 30000);

  it("captures gemini_cli bundle from the live machine", async () => {
    const out = await captureLive(adapterFor("gemini_cli"), "live");
    expect(fs.existsSync(out)).toBe(true);
  }, 30000);

  it("captures copilot bundle from the live machine", async () => {
    const out = await captureLive(adapterFor("copilot"), "live");
    expect(fs.existsSync(out)).toBe(true);
  }, 30000);

  it("captures grok_cli bundle from the live machine", async () => {
    const out = await captureLive(adapterFor("grok_cli"), "live");
    expect(fs.existsSync(out)).toBe(true);
  }, 30000);

  it("captures opencode bundle from the live machine", async () => {
    const out = await captureLive(adapterFor("opencode"), "live");
    expect(fs.existsSync(out)).toBe(true);
  }, 30000);

  it("captures devin bundle from the live machine", async () => {
    const out = await captureLive(adapterFor("devin"), "live");
    expect(fs.existsSync(out)).toBe(true);
  }, 30000);

  it("captures kiro bundle from the live machine", async () => {
    const out = await captureLive(adapterFor("kiro"), "live");
    expect(fs.existsSync(out)).toBe(true);
  }, 30000);

  it("captures antigravity_cli bundle from the live machine", async () => {
    const out = await captureLive(adapterFor("antigravity_cli"), "live");
    expect(fs.existsSync(out)).toBe(true);
  }, 30000);
});
