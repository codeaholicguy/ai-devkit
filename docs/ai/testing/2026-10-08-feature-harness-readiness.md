---
phase: testing
title: harness-readiness test report
description: Coverage and results for the I11 readiness port
---

# I11: readiness — testing

## Fixture parity (the oracle)

`fixtures/readiness/{healthy,degraded}.json` replay byte-identical
between `getAgentReadinessReports` (TS) and `readiness_reports`
(Rust `FixtureHost`):

- `healthy.json` — every check passes; all six auth probes reach
  `authenticated`, all three integrations `installed`; covers
  script+registration+mapping chains, `~`-collapsed display paths,
  builtin skills present/missing bookkeeping.
- `degraded.json` — exercises every failure edge: executable missing
  (`fail`), config dir missing, bundled asset mismatch (`scriptCheck`
  fail "differs from the bundled"), registration present-but-empty
  (`required hook registration is missing`), mapping with an invalid
  (`abc` pid) entry AND a stale sessionPath AND a valid one, `gh`/
  probe non-zero exit (→ `unknown`/`warn`), empty opencode list
  (`unauthenticated`/`fail`), pi auth.json with empty `provider`,
  codex `codexAuth: false` (`unauthenticated`/`fail`), skills missing
  subsets incl. no skillRoot (kiro).

## Results

- `cargo test --workspace`: 64 harness tests green (2 readiness
  bundles); `clippy --workspace -D warnings` clean.
- `vitest` agent-manager: 1345 passed.
- `vitest` cli: 1320 passed, 1 unrelated TUI timing flake (passes
  standalone).
- Live daemon smoke: `agent.readiness` → 10 ordered reports matching
  machine reality.
- `status` smoke: daemon-primary output identical to pre-port;
  `AI_DEVKIT_NO_DAEMON=1` exercises the local fallback.

## Known divergence (documented)

Codex auth is a file check (`~/.codex/auth.json`) daemon-side rather
than the capacity app-server RPC — three states preserved; a missing
`codex` binary no longer forces `unknown` when creds exist.
