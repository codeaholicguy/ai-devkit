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
- [x] OMP session locator maps the observed project bucket and strict CWD.
- [x] OMP parser maps user/assistant messages, summaries, timestamps, and status through the Pi-compatible parser.
- [x] OMP adapter returns process-only agents when sessions are unavailable.
- [x] Tmux command quoting preserves each structured argument.
- [x] Rust registry/start profile agrees with TypeScript OMP identity rules.

## Integration and E2E

- [x] Agent-manager focused/package tests pass.
- [x] CLI focused/package tests pass, including daemon and local start argument forwarding.
- [x] Rust workspace and daemon tests pass.
- [x] Isolated HOME smoke lists a fixture OMP session.
- [x] Installed `omp --version`/`omp --help` smoke confirms the environment's executable and profile flag without invoking a model.
- [x] Live cockpit smoke starts a model-configured OMP in tmux, discovers it as `type: "omp"`, and stops its process through `agent kill`.

## Known Baseline

- Sessionless OMP processes are intentionally process-only; `agent detail` requires an OMP JSONL session file.
- Daemon-backed `agent kill` terminates the OMP PID, but the managed tmux shell remains until explicit cleanup. This is runtime lifecycle behavior shared by the daemon start path, not OMP process detection.
- After building workspace packages, the baseline test suite had one existing failure in `PiDiscoveryIO.test.ts` where a newly added Pi session was not rechecked. This is tracked separately from OMP work.

- Focused TypeScript: agent-manager OMP/readiness/runtime/Tmux tests and CLI command/status/TUI/session tests passed.
- Full Nx test run: all 8 project test targets passed after the installed-launcher matcher fix; agent-manager reported 93 files/1380 tests and CLI reported 111 files/1350 tests.
- Rust: `cargo test --workspace` passed after the installed-launcher matcher fix; the repository's `cargo fmt` check was unavailable because the local rustup toolchain lacks an applicable `rustfmt` component.
- Smoke: built CLI `agent list --json` returned an OMP entry; installed `omp/18.12.6` exposes `--profile`; managed cockpit start/list/kill passed for a configured OMP process.

## Evidence Log
