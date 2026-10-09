---
phase: implementation
title: Implementation notes — devkitd-monorepo
description: What changed for the crate split, devkitd rename, ts-rs codegen, and Nx cargo wiring
---

# Implementation — devkitd-monorepo

## Changed files

**Rust workspace restructure + rename (M1, M2, T1.x, T2.1):**

- `rust/Cargo.toml` — `members = ["crates/*"]`, new `[workspace.dependencies]`
  centralizing all shared deps.
- `rust/crates/devkitd/` — binary crate (`main.rs`, `server.rs`), renamed
  from `ai-devkitd`; usage string and systemd unit name updated to `devkitd`.
- `rust/crates/devkit-core/` — new lib crate holding `proto.rs`, `store.rs`,
  `discover.rs` (moved via `git mv`); `chrono_now` relocated above the test
  module (clippy `items_after_test_module` fires under `-D warnings` now that
  lint runs workspace-wide).

**ts-rs codegen (M3, T3.1/T3.2):**

- `devkit-core` dep `ts-rs = "12"` (12.0.1, published 2026-01-31 — well past
  the 7-day vetting rule).
- `proto.rs` — `#[derive(TS)]` on `Request`/`Response`/`Event`; per-field
  `#[ts(type = "number")]` on `u64`/`i64` fields (ts-rs maps them to `bigint`
  by default, but JSON transports them as numbers); `#[ts(optional)]` where
  serde skips absent fields; `#[ts(type = "unknown")]` for `serde_json::Value`.
- `proto::tests::export_ts_bindings` — explicit export via
  `TS::export(&Config::with_out_dir(...))` anchored at `CARGO_MANIFEST_DIR`.
  **Deviation from plan:** `#[ts(export, export_to = ...)]` auto-export was
  abandoned — ts-rs joins `export_to` inside `export_dir` (default
  `./bindings`, CWD-relative), so `..` traversal both misplaced files and
  created stray dirs. The explicit test is deterministic under plain
  `cargo test`.
- `packages/daemon-client/src/gen/{Event,Request,Response}.ts` + `index.ts` —
  generated, checked in.
- `client.ts` — `DaemonEvent` is now a re-export of generated `Event`.
- `.prettierignore` — excludes `src/gen/` (generated files; oxfmt respects
  `.prettierignore`).

**Rename surface (M2):**

- `binary.ts` — `DEVKITD_BIN` primary, `AI_DEVKITD_BIN` fallback alias;
  filenames `devkitd`/`devkitd.exe`; `~/.ai-devkit/bin/devkitd`;
  `rust/target/*/devkitd`; platform package `@ai-devkit/devkitd-<plat>-<arch>`.
- `autostart.ts` — VITEST guard checks both env vars.
- `daemon.ts` (cli), `package.json` description, comments in
  `pi-session-tracker` and `channel-connector`.
- `client.test.ts` — rewritten for dual-env resolution (3 new cases).
- `integration.test.ts` — new binary name + dual-env.

**Nx wiring (M3, T3.3):**

- `rust/project.json` — `nx:run-commands` targets: `build`, `build:release`,
  `test`, `lint`, `fmt`, `fmt:check`; inputs scoped to `rust/**/*.rs` +
  Cargo manifests. Follows the per-package convention used elsewhere.

**Unchanged by design:** socket/db/log names, `AI_DEVKIT_NO_DAEMON`,
`@ai-devkit/daemon-client` package name, `ai-devkit daemon` command.

## Verification evidence

- `cargo build/test/clippy -D warnings/fmt` — green (17 tests).
- `nx run rust:{build,test,lint,fmt:check}` — all green via Nx; `nx run-many
  -t build` ran `rust:build` in the graph (8 projects).
- `daemon-client` vitest: 9 pass incl. real-binary `ensureDaemon` spawn of
  `devkitd`, `daemon.status` roundtrip, and dual-env resolution cases.
- `npm run test:e2e` — 42/42 pass.
- `npm run lint` — green incl. `rust:lint` (clippy `-D warnings`).
- `npm test` — 4 flaky timeouts in `status.service.test.ts` (5s-timeout tests
  under parallel load); same file passes standalone in worktree (21.8s) and
  on base — unrelated to this change.
- `fmt:check` — 36 pre-existing issues (same as base; gen/ excluded).

## Follow-ups / not done

- `devkit-harness` crates + `fixtures/` corpus (v1.5+ per requirements).
- Platform binary packages `@ai-devkit/devkitd-<plat>-<arch>` — resolution
  path exists; packages not yet published (release workflow wiring).
- `apps/` split deferred until console is daemon-dumb.
