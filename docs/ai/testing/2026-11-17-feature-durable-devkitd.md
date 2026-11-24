---
phase: testing
title: Durable agents managed by devkitd
---

# Durable devkitd testing plan

## Scenarios
- [x] T1 (P1): create/list/resolve identity, name ambiguity, canonical cwd; acquire/busy/token completion and concurrent acquisition; stale token and session binding protections.
- [x] T2 (P2): shared Claude/Codex/Pi parser fixtures match TS results/errors; missing completion, malformed/incomplete/oversized stream and session mismatch reject; first/resume argv parity.
- [x] T3 (P3): real stub process exit 0/nonzero/signal, protocol failure, spawn error; socket disconnect preserves run; stop race/idempotence; startup adoption and unrecoverable death; reused PID and failed observation.
- [x] T4 (P4): daemon-only durable ownership — no legacy `agents.db` import or fence file; mixed read commands skip durable lookup when `devkitd` is absent/outdated while explicit mutations require a compatible daemon.
- [x] T5 (P5): typed client methods and CLI durable start/send/session/sessions outputs, `--debug` tracing, `--cwd` symlink canonicalization, and cross-mode ambiguity preservation.
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
- Root `npm run test`: exit 0 for seven projects and dependencies; includes `npx nx test cli`, 18 shared TS parity cases, daemon-client wire tests and the Rust workspace.
- `cargo test --manifest-path rust/Cargo.toml`: 205 tests passed, zero failures across six suites (45 core, 10 durable store, 82 harness, 4 durable parser/profile/locator, 55 daemon, 9 durable daemon integration).
- `cargo clippy --manifest-path rust/Cargo.toml --workspace --all-targets -- -D warnings`: exit 0 (verified on Linux and macOS).
- `npm run lint`: exit 0; existing unrelated TS warnings remain, no lint errors.
- `npm run fmt:check`: exit 0.
- `npx vitest run --config e2e/vitest.config.ts e2e/durable-devkitd.e2e.ts`: one E2E passed, exercising all three provider create/send/resume/session flows through built CLI and real daemon.
- Disposable smoke (macOS): verified daemon startup, create/send/resume for Claude/Codex/Pi, `--debug` routing logs, `sessions --all`, `session detail` by name and `providerSessionId`, `sessions --cwd <symlink>`, invalid cwd, nonzero exit, malformed stream, busy rejection, restart adoption, non-blocking stop during 2s grace period, adopted `SIGTERM`-ignoring `SIGKILL` escalation, and idempotent stop.
- Feature docs lint: all checks passed.

Legacy `agents.db` import and ownership-fence fallback were removed in favor of a simpler daemon-only design (users recreate durable identities). OS permission/probe failures were reviewed through the fallible observation path, not injected; Windows behavior was not executed (Linux and macOS are verified). The accepted restart limit remains documented.
