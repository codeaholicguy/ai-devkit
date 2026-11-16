---
phase: testing
title: "OMP Agent Harness Support - Testing"
feature: omp-adapter
description: Test strategy and evidence for OMP detection, sessions, profile args, and daemon parity
---

# Testing: OMP Agent Harness Support

## Coverage Goals

- Cover all new OMP branches that affect process ownership, path safety, session mapping, and status.
- Cover structured arguments from CLI/console to both local and daemon Tmux runtimes.
- Keep TypeScript and Rust process matching behavior equivalent.
- Use fixtures for CI; use the installed OMP binary only for no-model smoke checks.

## Unit Tests

- [x] `omp` is present in exhaustive agent type lists, labels, adapters, and session filters.
- [x] OMP matcher accepts direct CLI, Bun-launched `dist/cli.js`, and the installed Bun `/bin/omp` shim.
- [x] OMP matcher rejects unrelated Bun/Node processes and paths containing only incidental `omp` text.
- [x] OMP session locator maps default, named-profile, XDG, and override roots with upstream-compatible project buckets.
- [x] OMP parser maps user/assistant messages, summaries, timestamps, and status through the Pi-compatible parser.
- [x] OMP adapter returns process-only agents when sessions are unavailable.
- [x] Tmux command quoting preserves each structured argument, including empty values.
- [x] Rust registry/start profile agrees with TypeScript OMP identity rules.

## Integration and E2E

- [x] Agent-manager focused/package tests pass.
- [x] CLI focused/package tests pass, including daemon and local start argument forwarding and OMP status skills.
- [x] Rust workspace and daemon targeted tests cover direct sweep discovery, OMP roots, and Tmux quoting.
- [x] Readiness fixture replay covers a healthy OMP executable, config root, and built-in skill root.
- [x] Built CLI `agent list --json` discovers live `type: "omp"` processes; installed `omp --version`/`omp --help` exposes the profile flag without invoking a model.
- [ ] Interactive cockpit start/message/kill smoke remains unautomated; cockpit command help and noninteractive discovery were verified.

## Known Baseline

- Sessionless OMP processes are intentionally process-only; `agent detail` requires an OMP JSONL session file.
- Daemon-backed `agent kill` terminates the OMP PID, but the managed tmux shell remains until explicit cleanup. This is runtime lifecycle behavior shared by the daemon start path, not OMP process detection.
- Pi live-discovery refresh now has a bounded fallback recheck for filesystems that do not update directory timestamps on new files.

- Focused TypeScript: agent-manager OMP/readiness/runtime/Tmux/Pi tests and CLI command/status/TUI/session tests passed.
- Full Nx test run: all 7 workspace targets passed; agent-manager reported 93 files/1404 tests and CLI reported 113 files/1462 tests.
- Rust: `cargo test --workspace`, `cargo fmt --all -- --check`, and clippy passed.
- Smoke: built CLI `agent list --json` returned three live OMP entries; installed `omp/18.20.3` exposes `--profile`; cockpit help loaded without entering its interactive UI.

## Evidence Log
