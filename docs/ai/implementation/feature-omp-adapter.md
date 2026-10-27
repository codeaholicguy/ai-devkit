---
phase: implementation
title: "OMP Agent Harness Support - Implementation"
feature: omp-adapter
description: Implementation notes, decisions, deviations, and verification evidence for OMP support
---

# Implementation: OMP Agent Harness Support

- Phase: Check Implementation
- Branch: `feature-omp-adapter`
- Worktree: `/tmp/ai-devkit-omp-worktree`
- Current task: align implementation records with the completed TypeScript/Rust changes and verification queue.

## Changed Files

- Agent-manager: OMP adapter, Pi locator parameterization, type/registry/runtime/readiness integration, Tmux argument quoting, Bun `/bin/omp` launcher detection, and focused tests.
- CLI: `agent start --arg`, TUI structured argument forwarding, labels, status/session/start tests.
- Rust: OMP adapter/registry/start profile, Bun `/bin/omp` launcher detection, and daemon Tmux argument quoting/tests.
- Project docs: README, CHANGELOG, and readiness fixtures.

## Decisions

- Structured OMP profile arguments replace shell alias execution.
- Rust `devkitd` support is required because non-empty daemon discovery is authoritative.

- OMP project buckets use the observed home-relative encoding; the default root is `~/.omp/agent/sessions`.
- Registry session paths are accepted only when they remain below the OMP sessions root.
- OMP durable mode remains out of scope; arbitrary shell aliases are never evaluated.

## Verification Evidence

- Preflight: `npx ai-devkit@latest lint` and `npx ai-devkit@latest lint --feature omp-adapter` passed.
- Setup/build: `npm ci`, `npm run build`, `npm run lint`, and TypeScript formatting passed; the local rustup toolchain lacked an applicable `rustfmt` component for the final Rust format check.
- Tests: full Nx test targets and `cargo test --workspace` passed after the launcher-shape fix.
- Smoke: installed OMP 18.12.6 launches as `bun .../bin/omp`; the cockpit now recognizes that real process shape.
- Cockpit smoke: daemon-backed `agent start --type omp` succeeded with a configured model, `agent list --json` reported `type: "omp"`, and `agent kill` stopped the OMP PID. `agent detail` is unavailable for a sessionless OMP process, and kill leaves the empty tmux shell until the daemon refreshes/cleanup path handles it.
- Initial baseline before the build had one Pi live-discovery failure; the final full suite passed after the launcher-shape fix.
