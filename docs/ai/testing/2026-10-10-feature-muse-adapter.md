---
phase: testing
title: Testing Strategy
description: Define testing approach and coverage requirements
---

# Testing Strategy

Derived from the requirements success criteria and the design components. Follows the
existing harness suites (adapter, locator, parser, readiness, summary equivalence, tail parity).

## Scenarios

- [x] Live detection: runtime file + matching `muse-bin-*` process yields one `AgentInfo`
  with exact pid, session id, and `workspace_root` project path.
- [x] Stale runtime file (dead pid, recycled pid outside staleness window) is not reported live.
- [x] Archive enumeration finds dated sessions, applies strict cwd filter, and excludes
  `subagent/`, logs, `cron.db`, and `*.sqlite3` noise.
- [x] `findSessionsById` resolves from the runtime dir without walking the archive.
- [x] `getConversation` returns ordered user/assistant messages; `tail: N` returns the last N
  with cost proportional to the tail on a large fixture transcript.
- [x] First-user-message filtering skips tool-result blocks and system-injected content.
- [x] Microsecond timestamps normalize to millisecond `Date`s.
- [x] Unreadable (`0600`) files are skipped, not fatal.
- [x] Readiness matrix: missing executable, missing config dir, missing/invalid `auth.json`,
  missing built-in skills → correct pass/warn/fail states.
- [x] Session-summary equivalence with the harness conventions (verbatim id round-trip).

## Mocks / Fixtures

- `fixtures/harness/muse/matched.json` and `fallback.json` (runtime entry + framed transcript
  lines, live and stale variants).
- Large synthetic framed transcript for tail-cost assertions.
- Fake home trees for readiness states (no real `~/.local` touched).

## Coverage Target

- New `muse/` harness files at the same bar as `claude/`/`codex/` suites: locator, parser,
  mapper, adapter, readiness, and parity tests all green alongside the existing suites.

## Results

- New suites: `MuseSessionParser` (10), `MuseSessionLocator` (5), `MuseAgentMapper` (3),
  `MuseAdapter` (6) — all green.
- Extended suites: readiness `AgentReadiness` (+3 muse cases), `runtimeProfiles` (+1),
  `process` prefix matching (+1).
- Golden fixtures: `fixtures/harness/muse/{matched,fallback}.json` replay byte-identical;
  readiness `healthy`/`degraded` replay green with muse entries.
- Full agent-manager suite: 1365+ passed, 0 failed; `tsc --noEmit` clean; `oxlint` 0/0.
- Coverage (scoped run): `harnesses/muse` ~86% lines; remaining lines are defensive
  close/error paths. Global-threshold errors on scoped runs are expected (subset artifact).
- Live verification (read-only, not committed): parser run against the real session
  transcript reproduced session id, workspace root, display name, model, 65 messages,
  correct tail and WAITING status.
- Watch item: one intermittent `ManagedAgentRuntime` spaced-path failure under full-suite
  parallelism (passes in isolation/reruns; green on the untouched base too).
