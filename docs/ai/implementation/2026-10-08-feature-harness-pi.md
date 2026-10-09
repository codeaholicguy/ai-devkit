---
phase: implementation
title: harness-pi implementation notes
description: What the I3 pi port shipped and where parity needed fixes
---

# I3: harness-pi implementation

## Shipped

- `rust/crates/devkit-harness/src/pi/mod.rs` — `PiAdapter` with
  whitespace-token executable detection (`pi`, `pi.js`, `pi.exe`),
  `SessionTracker` over `~/.pi/agent/sessions.json` (trusted-path gate),
  detect pipeline in TS order: tracker → registry → locator →
  process-only (`"Pi process running"`).
- `rust/crates/devkit-harness/src/pi/locator.rs` — per-cwd encoded
  project dirs under `~/.pi/agent/sessions`, filename timestamp
  (`YYYY-MM-DDTHH-MM-SS-sssZ_`) candidacy OR birthtime, greedy
  `≤3min` matching via `shared::match_processes_to_sessions`.
- `rust/crates/devkit-harness/src/pi/parser.rs` — bounded fold,
  `PiSummary` state: first-entry sessionId/cwd sticky, last-role +
  last-user-message + last-timestamp reduction, filename id fallback,
  `None` for entry-free files.
- Registry fallback reuses `shared::registry_session_paths` (readonly
  SQLite, `type='pi'`) — the same code path I2 added for codex.
- Daemon: `PiAdapter` in `default_registry` → `ported` is
  `["claude","codex","pi"]`; server test assertion updated.
- TS capture: `HARNESS_DIRS.pi = [".pi/agent/sessions"]`,
  `HARNESS_FILES.pi = [".pi/agent/sessions.json"]` (avoids sweeping up
  `auth.json` et al.); `pi` added to `REGISTRY_AWARE` in the fixture
  test.

## Parity fixes during implementation

- `is_idle`: TS uses float division (`x/60000 > 5`) — Rust must compare
  `ms > 300000` on the raw delta, not the floored minutes; fixed in
  `shared::is_idle`.
- Legacy matching: filename timestamp only gates candidacy — the final
  matcher still compares `proc.startTime` to file **birthtime**. For a
  deterministic fixture the process uses `"startTime": "$NOW"` and the
  legacy session sits in its own project dir (otherwise multiple
  ~now-birthtime files in the same dir make greedy pairing flaky).
- Entry-free session files (`"not json\n[1,2]\n"`) must yield
  `None`/parse-fail — a stray `{"a":1}` object counts as an entry and
  produces a real session; fallback fixture content adjusted.
- Borrow-checker fix in the fold: copy the line slice before applying
  (`head.bytes_read` was mutably borrowed).
- Filename timestamp unit test: expected value corrected to
  `1781081900754` (the `Date.parse` value of the supplied 2026 stamp —
  my arithmetic, not the code, was wrong).
