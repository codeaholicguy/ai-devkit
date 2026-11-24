---
phase: testing
title: Agent group validation plan
description: Acceptance coverage and evidence for issue 413
---

# Agent group validation

## Scenarios

- [x] T1 (A1/A2): CRUD, insertion/member order (`LEFT JOIN`), persistence, and
  timestamp behavior.
- [x] T2 (A2/A3): Normalization, duplicate/blank/empty rejection, domain error
  precedence, no-op add, absent-member and final-member removal.
- [x] T3 (A1/A2): Concurrent mutations and SQL transaction rollback (trigger
  fault injection) preserve invariants.
- [x] T4 (A1/A3): All eight `group.*` RPCs, malformed wire types
  (`invalid_params`), `unknown_method`, and coded domain errors.
- [x] T5 (A1/A3/A5): All seven CLI routes (including `--debug`), typed
  `DaemonClient` calls, caller-owned client reuse, `onDebug` forwarding, error
  mapping, unsupported methods, unavailable daemon, and transport failure
  without legacy fallback.
- [x] T6 (A4): Ordered `group.lookup` then `agent.lookup` targeting, missing/dead
  members, immediate abort on transport/`unknown method` errors, no spurious
  unknown-status busy warnings, and per-member delivery reporting; ordinary
  single-agent path unchanged.
- [x] T7 (A6): Root E2E (`e2e/agent-groups.e2e.ts`) through built CLI and real
  `devkitd`: create/add/send/detail/list/update/remove-agent/remove, ordered
  `group.lookup` + `agent.lookup` wire verification with dead stub
  registrations, error categories, and restart persistence in disposable `HOME`.
- [x] T8 (A6): Full Rust, `daemon-client`, and CLI test suites, workspace build,
  formatting (`oxfmt` + `cargo fmt`), lint, clippy, and feature docs lint.

## Fixtures and placement

- Rust core store tests: `rust/crates/devkit-core/tests/groups.rs`
- Rust daemon RPC tests: `rust/crates/devkitd/tests/rpc/groups.rs`
- TypeScript unit/integration tests:
  - `packages/daemon-client/tests/groups.test.ts`
  - `packages/cli/tests/services/agent/agent-group.service.test.ts`
  - `packages/cli/tests/services/agent/agent.service.test.ts`
  - `packages/cli/tests/commands/agent.test.ts`
- Root E2E tests: `e2e/agent-groups.e2e.ts` (run with `e2e/vitest.config.ts`)

All tests use isolated temp directories, disposable `HOME`, and dead stub
registrations — never real agents or real user `~/.ai-devkit` data.

## Final Validation Evidence (2026-11-24, rebased onto `origin/main` `7528c760`)

All commands exited `0`:

- `npm run build` — all 7 workspace projects built cleanly.
- `cd rust && cargo test` — `devkit-core` (45 unit + 10 durable + 4 groups),
  `devkitd` (57 unit/rpc + 9 durable), 0 failed.
- `cd rust && cargo fmt --all --check && cargo clippy --all-targets -- -D warnings` — passed.
- `npm test -w @ai-devkit/daemon-client` — 4 files / 29 tests passed.
- `npm test -w ai-devkit` — 117 files / 1541 tests passed.
- `npm run fmt:check && npm run lint` — all 6 configured lint projects passed.
- `npx vitest run --config e2e/vitest.config.ts e2e/agent-groups.e2e.ts` —
  1/1 passed against built CLI (`packages/cli/dist/cli.js`) and real `devkitd`.
- `nx run-many -t test` (via pre-commit hook) — all 7 projects passed.
