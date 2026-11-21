---
phase: testing
title: Durable agents managed by devkitd
---

# Durable devkitd testing plan

## Scenarios
- [x] T1 (P1): create/list/resolve identity, name ambiguity, canonical cwd; acquire/busy/token completion and concurrent acquisition; stale token and session binding protections.
- [x] T2 (P2): shared Claude/Codex/Pi parser fixtures match TS results/errors; missing completion, malformed/incomplete/oversized stream and session mismatch reject; first/resume argv parity.
- [x] T3 (P3): real stub process exit 0/nonzero/signal, protocol failure, spawn error; socket disconnect preserves run; stop race/idempotence; startup adoption and unrecoverable death; reused PID and failed observation.
- [x] T4 (P4): empty/missing legacy DB, preserve IDs/state/active and last result, one-time marker, transaction rollback/retry/conflicts, ownership fence denies stale fallback.
- [x] T5 (P5): typed client methods and CLI durable start/send/session/sessions outputs; capability absence permits pre-transfer fallback, post-transfer outage and mutation failure never fall back; cross-mode ambiguity preserved.
- [x] T6 (P6): isolated real daemon/socket/CLI E2E with start-profile stub commands, repeat send/session/stop/restart/import flows; disposable smoke without APIs.

## Fixtures and Coverage
Use temporary DBs/homes and executable scripts resolved through start profiles, never provider services. Shared NDJSON cases exercise Rust parser and existing TS parsers. Target behavioral branch coverage for transitions, ownership, parsing and routing; no artificial percentage target.

## Required Commands
cargo test (rust workspace); npm run build; npx nx test cli; npx vitest run --config e2e/vitest.config.ts (new durable cases); npm run lint; npm run fmt:check; docs feature lint; disposable smoke.

## Results
TDD and acceptance results are recorded below. Smoke was executed against built binaries in a disposable home.

P2-P4 evidence: Rust fixture/argv tests 2 passed (18 shared cases); TS parity 18 passed. Core migration/store suite 7 passed. Real daemon socket/process suite 2 passed, exercising disconnect, actual exit, parser failure, stop and restart adoption. Protocol failure killed by the daemon remains failed, with its observed nullable exit code; external signals are interrupted. No provider APIs used. Skills loaded: dev-implementation, tdd, verify, dev-planning.

## Acceptance Evidence
- Root `npm run build`: exit 0 for seven projects.
- Root `npm run test`: exit 0 for seven projects and dependencies; includes `npx nx test cli` (1,521 CLI tests across 116 files), 18 shared TS parity cases, daemon-client wire tests and the Rust workspace.
- `cargo test --manifest-path rust/Cargo.toml`: 209 tests passed, zero failures across six suites (45 core, 13 durable store, 82 harness, 3 durable parser/profile, 55 daemon, 11 durable daemon integration).
- `cargo clippy --manifest-path rust/Cargo.toml --workspace --all-targets -- -D warnings`: exit 0 (verified on Linux and macOS).
- `npm run lint`: exit 0; existing unrelated TS warnings remain, no lint errors.
- `npm run fmt:check`: exit 0.
- `npx vitest run --config e2e/vitest.config.ts e2e/durable-devkitd.e2e.ts`: one E2E passed, exercising legacy import and all three provider create/send/resume/session flows through built CLI and real daemon.
- Targeted V8 coverage: 193 tests passed; routing module 93.1% statements / 85.36% branches / 88.23% functions / 92.72% lines. Uncovered branches are defensive malformed-wire checks and remote list/resolve paths also exercised by E2E.
- Disposable smoke (macOS round-2): 15 checks passed (daemon startup, legacy import + ownership fence, create/send/resume for Claude/Codex/Pi, `--debug` routing logs, `sessions --all`, `session detail` by name and `providerSessionId`, `sessions --cwd <symlink>`, invalid cwd, nonzero exit, malformed stream, busy rejection, restart adoption, non-blocking stop during 2s grace period, adopted `SIGTERM`-ignoring `SIGKILL` escalation, idempotent stop, post-transfer outage fence). No provider APIs used by smoke; scripts and sandboxes are removed after verification.
- Feature docs lint: all checks passed.

Regression evidence is recorded in the implementation artifact. OS permission/probe failures were reviewed through the fallible observation path, not injected; Windows behavior was not executed (Linux and macOS are verified). The accepted restart limit and unsupported mixed-version legacy writes remain documented rollout limits. Failed exploratory runs are not acceptance evidence.
