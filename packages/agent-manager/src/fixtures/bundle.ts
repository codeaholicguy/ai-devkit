/**
 * Golden-fixture bundles: the parity oracle for the devkit-harness Rust port.
 * A bundle records everything `detectAgents` consumed and produced so both
 * the TS adapter and its Rust port can be run against identical inputs.
 *
 * Format (committed under fixtures/harness/<type>/<case>.json):
 * {
 *   adapter, capturedAt, frozenNow,
 *   processes: ProcessInfo[],
 *   home: { "<relpath under $FIXTURE_HOME>": "<content with $FIXTURE_HOME refs>" },
 *   expected: AgentInfo[] (dates as ISO strings)
 * }
 */

import type { AgentInfo, ProcessInfo } from "../adapters/AgentAdapter.js";

export const HOME_PLACEHOLDER = "$FIXTURE_HOME";

export interface FixtureBundle {
  adapter: string;
  capturedAt: string;
  /** Epoch ms the clock was frozen at during capture/replay. */
  frozenNow: number;
  processes: ProcessInfo[];
  /** Files under the fixture HOME; content may embed HOME_PLACEHOLDER. */
  home: Record<string, string>;
  expected: Record<string, unknown>[];
}

/**
 * Rewrite harness dot-dir paths (`<home>/.claude`, `<home>/.codex`, …) to the
 * placeholder — nothing else. Project cwds share the home prefix
 * (`<home>/Code/proj`) and MUST stay literal: harnesses encode them into
 * session-dir names (`-Users-foo-proj`), so rewriting them breaks
 * cwd↔session matching on replay.
 */
export function sanitize<T>(value: T, realHome: string): T {
  const homeDot = `${realHome}/.`;
  if (typeof value === "string") {
    return value.split(homeDot).join(`${HOME_PLACEHOLDER}/.`) as T;
  }
  if (Array.isArray(value)) return value.map((v) => sanitize(v, realHome)) as T;
  if (value && typeof value === "object") {
    if (value instanceof Date) return value.toISOString() as T;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitize(v, realHome);
    return out as T;
  }
  return value;
}

/** Inverse of sanitize: expand the placeholder to a concrete dir. */
export function expand<T>(value: T, fixtureHome: string): T {
  if (typeof value === "string") {
    return value.split(HOME_PLACEHOLDER).join(fixtureHome) as T;
  }
  if (Array.isArray(value)) return value.map((v) => expand(v, fixtureHome)) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = expand(v, fixtureHome);
    return out as T;
  }
  return value;
}

/** Agents normalized the way the wire carries them (Date → ISO string). */
export function normalizeAgents(agents: AgentInfo[], realHome: string) {
  return sanitize(JSON.parse(JSON.stringify(agents)), realHome);
}

/**
 * Freeze `Date` at `epochMs` for the duration of `fn`. Adapters stamp
 * `new Date()` in several places; parity requires a fixed clock.
 */
export async function withFrozenClock<T>(epochMs: number, fn: () => Promise<T>): Promise<T> {
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(epochMs);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else super(...(args as [any]));
    }
    static override now() {
      return epochMs;
    }
  }
  const g = globalThis as { Date: DateConstructor };
  g.Date = FrozenDate as DateConstructor;
  try {
    return await fn();
  } finally {
    g.Date = RealDate;
  }
}
