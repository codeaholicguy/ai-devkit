---
phase: planning
title: Plan — devkitd-monorepo
description: Task breakdown for crate split, devkitd rename, ts-rs types, Nx cargo wiring
---

# Plan — devkitd-monorepo

## Milestones

- [x] M1: Rust workspace restructure (`crates/devkitd` + `crates/devkit-core`),
  cargo suite green
- [x] M2: `devkitd` rename across Rust + TS surfaces, tests green
- [x] M3: ts-rs generated types + Nx cargo project wired
- [x] M4: Docs updated, full verification (nx + cargo + e2e)

## Task Breakdown

### M1 — workspace restructure

- [x] T1.1: `git mv rust/ai-devkitd rust/crates/devkitd`; move `proto.rs`,
  `store.rs`, `discover.rs` into `rust/crates/devkit-core/src/`; add `lib.rs`
  re-exporting the three modules. Update `main.rs`/`server.rs` imports from
  `crate::` to `devkit_core::`. Move embedded `#[cfg(test)]` modules with
  their files.
- [x] T1.2: `rust/Cargo.toml` → `members = ["crates/*"]`; new
  `crates/devkit-core/Cargo.toml` (lib: serde, serde_json, rusqlite, anyhow);
  `crates/devkitd/Cargo.toml` (bin: devkit-core path dep, tokio, libc,
  tracing, tracing-subscriber). Workspace deps centralized via
  `[workspace.dependencies]`.
- [x] T1.3: Verify `cargo build/test/clippy/fmt` green. Evidence: command
  output.

### M2 — rename devkitd

- [x] T2.1: Rust: crate name `devkitd`, usage string, systemd unit
  `devkitd.service` in `main.rs`.
- [x] T2.2: `binary.ts`: filenames `devkitd`/`devkitd.exe`,
  `~/.ai-devkit/bin/devkitd`, `rust/target/*/devkitd`, platform package
  `@ai-devkit/devkitd-<plat>-<arch>`, env `DEVKITD_BIN` with
  `AI_DEVKITD_BIN` fallback.
- [x] T2.3: `autostart.ts` dual-env check; `daemon.ts` (cli) strings +
  error message; test files referencing `ai-devkitd`/`AI_DEVKITD_BIN`.
- [x] T2.4: Verify `nx run-many -t test -p @ai-devkit/daemon-client,ai-devkit`.

### M3 — ts-rs + Nx

- [x] T3.1: `ts-rs` dev-dep on devkit-core; `#[derive(TS)] #[ts(export)]` on
  `Request`, `Response`, `Event`; `export_bindings` test writing to
  `packages/daemon-client/src/gen/`; run and commit generated files.
- [x] T3.2: `client.ts` `DaemonEvent` → re-export generated `Event`;
  `index.ts` exports the generated types.
- [x] T3.3: `rust/project.json` with nx:run-commands targets
  (build, build:release, test, lint, fmt, fmt:check); verify `nx show
  project rust`, `nx run rust:test`, and cache skip on rebuild.

### M4 — docs + verification

- [x] T4.1: Update `docs/ai/*/2026-10-07-feature-rust-daemon.md` code-facing
  names (crate path, binary name); README/other docs mentioning `ai-devkitd`
  binary.
- [x] T4.2: Full verification: `cargo fmt --check`, `clippy -D warnings`,
  `cargo test`, `nx run-many -t build,test,lint`, `npm run test:e2e`.

## Dependencies

- T1.x before all (layout first); T2 can parallel T3 conceptually but both
  touch binary.ts-adjacent code — do sequentially T2 → T3.
- ts-rs crate version ≥7 days old at add time.

## Risks

- `import.meta.url` dirname walk in binary.ts assumes `rust/` at repo root —
  unchanged since target dir stays `rust/target`.
- Nx `run-many` picks up the rust project automatically via project.json
  discovery — verify `nx show projects` lists `rust`.
- Generated files committed: ensure `.gitignore` doesn't exclude
  `packages/daemon-client/src/gen/`.

## Status summary (reconciled post-implementation)

All M1–M4 tasks complete. Deviations: (1) ts-rs auto-export replaced by an
explicit `export_ts_bindings` test because `export_to` resolves inside
CWD-relative `./bindings`; (2) `chrono_now` moved above the test module for
workspace-wide clippy `-D warnings`; (3) `src/gen/` excluded via
`.prettierignore` since generated files must stay byte-stable. No new tasks
discovered; flaky `status.service.test.ts` timeouts are pre-existing under
parallel load.
