---
phase: testing
title: Testing Strategy — devkitd-monorepo
description: Coverage for crate split, devkitd rename, ts-rs generated types, Nx cargo targets
---

# Testing Strategy — devkitd-monorepo

## Test Coverage Goals

- All existing Rust unit/integration tests must pass **unmodified in
  behavior** after the crate split (they move, they don't change semantics).
- All existing daemon-client vitest suites pass after the rename; new
  coverage only where behavior changed (env var resolution, binary names).
- Target: 100% of changed code paths exercised; this feature is refactor +
  config, so existing tests are the primary regression net.

## Unit Tests

### devkit-core (moved code, `rust/crates/devkit-core/`)

- [x] proto tests: request parse, response shape, event frame — unchanged
- [x] store tests: registry roundtrip, event replay, snapshot diff,
  concurrent writer, reopen persistence — unchanged
- [x] discover tests: ps fixture parse, basename matching, malformed
  lines — unchanged
- [x] `export_bindings` test emits `Event`, `Request`, `Response` TS files
  into `packages/daemon-client/src/gen/` with expected field names

### devkitd (binary crate)

- [x] server tests: end-to-end rpc/subscribe/replay, malformed line —
  unchanged after move
- [x] `devkitd` usage line prints `devkitd [serve|install|status]`
- [x] systemd unit file written as `devkitd.service` with correct ExecStart

### daemon-client (TS)

- [x] `resolveDaemonBinary` prefers `DEVKITD_BIN`, falls back to
  `AI_DEVKITD_BIN` alias, then platform pkg `devkitd-<plat>-<arch>`, then
  `~/.ai-devkit/bin/devkitd`, then `rust/target/*/devkitd`
- [x] generated `Event` type is assignable where `DaemonEvent` was used
- [x] autostart still refuses spawn under `VITEST` without binary env

## Integration Tests

- [x] `packages/daemon-client` integration test compiles/connects against a
  real `devkitd` binary when env points at it (unchanged test, new name)
- [x] `nx run rust:test` runs the full cargo suite through Nx
- [x] `nx run rust:lint` runs clippy with `-D warnings`
- [x] Second `nx run rust:build` is skipped/cached when inputs unchanged

## End-to-End Tests

- [x] `ai-devkit daemon status/start/stop` work against a spawned `devkitd`
- [x] `e2e/cli.e2e.ts` passes (daemon-dependent paths fall back cleanly when
  no binary is present in the test env)
- [x] Console subscription path unchanged (registry/agent events still flow)

## Test Data

- Existing `PS_FIXTURE` golden fixture (moved with discover.rs)
- ts-rs generated snapshots = the gen/*.ts files themselves (checked in;
  regeneration must be byte-stable)

## Test Reporting & Coverage

- Rust: `cargo test --workspace`, `cargo clippy --workspace --all-targets --
  -D warnings`, `cargo fmt --all -- --check`
- TS: `nx run-many -t test,lint` across packages
- Full: `npm run build` + `npm run test:e2e`

## Results (2026-10-08)

- devkit-core: 13 tests pass incl. `export_ts_bindings` (generates gen/*.ts
  deterministically via CARGO_MANIFEST_DIR-anchored path).
- devkitd: 2 integration tests pass (rpc/subscribe/replay, malformed input).
- daemon-client: 9 pass incl. real `devkitd` spawn roundtrip; dual-env
  resolution covered by 3 new cases.
- `nx run rust:test/lint/fmt:check` green; `nx run-many -t build` includes
  `rust:build`.
- e2e: 42/42. `cli:test` flaky timeouts in `status.service.test.ts` are
  pre-existing (pass standalone, both branches).
