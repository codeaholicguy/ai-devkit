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
import { createBuiltinAdapters } from "../harnesses/index.js";
import { expand, normalizeAgents, withFrozenClock } from "../fixtures/bundle.js";
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

function adapterFor(type: string) {
  const adapter = createBuiltinAdapters().find((a) => a.type === type);
  if (!adapter) throw new Error(`no builtin adapter for "${type}"`);
  return adapter;
}

/** Materialize a bundle into a temp HOME; returns cleanup + replay inputs. */
function materialize(bundle: FixtureBundle) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "fixture-home-"));
  for (const [rel, content] of Object.entries(bundle.home)) {
    const p = path.join(home, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, expand(content, home));
  }
  // JSON round-tripped Date fields (e.g. ProcessInfo.startTime) come back as
  // ISO strings — adapters expect real Date instances.
  const processes = expand(bundle.processes, home).map((p) => ({
    ...p,
    startTime: p.startTime ? new Date(p.startTime) : undefined,
  }));
  return {
    home,
    processes,
    cleanup: () => fs.rmSync(home, { recursive: true, force: true }),
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
      const { home, processes, cleanup } = materialize(bundle);
      try {
        process.env.HOME = home;
        const agents = await withFrozenClock(bundle.frozenNow, () =>
          adapterFor(bundle.adapter).detectAgents({ processes }),
        );
        expect(normalizeAgents(agents, home)).toEqual(bundle.expected);
      } finally {
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
});
