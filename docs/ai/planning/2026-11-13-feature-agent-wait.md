---
phase: planning
title: Project Planning & Task Breakdown
description: Task plan for daemon status-change events and `agent wait`
---

# Project Planning & Task Breakdown

## Milestones

- [x] M1: Daemon emits `agent.status_changed`
- [x] M2: `agent wait` service + command
- [x] M3: Orchestration skill uses `agent wait`; verified end to end

## Task Breakdown

### M1: Daemon

- [x] 1.1 Add pure `status_changes(prev, cur)` in `rust/crates/devkitd/src/server.rs`, emit from `apply_sweep` after appeared events. Tests: Rust unit cases from testing doc. Evidence: `cargo test -p devkitd`.

### M2: CLI

- [x] 2.1 `agent-wait.service.ts`: `parseWaitUntil`, `diffAgentChanges`, `waitForAgentChanges` with an injected `AgentWaitSource` (timing tested with vitest fake timers, no clock seam). TDD with unit tests in `packages/cli/tests/services/agent/agent-wait.service.test.ts`. Depends: none.
- [x] 2.2 `wait.command.ts` + registration: options, `--id`/`--group` resolution, daemon/local source, text/JSON output. Integration tests in `tests/commands/agent.test.ts`. Depends: 2.1.

### M3: Skill + verification

- [x] 3.1 Update `skills/agent-orchestration/SKILL.md` loop step 5.
- [x] 3.2 Build + full CLI tests + typecheck/lint; smoke against real daemon with fake agent.

## Dependencies

- 2.2 depends on 2.1. 1.1 is independent of 2.x (CLI works with old daemon via 30s re-check).
- Smoke (3.2) needs a built `devkitd` (`cargo build`) and `npm run build`.

## Timeline & Estimates

- Small feature: ~1 session.

## Risks & Mitigation

- Status flapping (`unknown` ↔ other) causing noisy wakes → wakes are cheap; diff only fires on target states.
- Missed events / older daemon → 30s safety re-check.
- Name drift between daemon payload and `agent list` → decisions come from canonical list, not payloads.

## Resources Needed

- Smoke recipe from memory: sandboxed HOME, tmux fake agents, `DEVKITD_BIN=rust/target/debug/devkitd`.

## Progress Summary

All tasks are done. The daemon emits `agent.status_changed`, and `agent wait` (service and command) shipped with unit and integration tests. The orchestration and agent-management skills and the web docs are updated. One design change came out of the design review: the 30s re-check always runs, rather than only after a lost subscription, which also covers an older daemon. Smoke-tested against a real `devkitd` with a fake Codex agent. Not done: the `feature-agent-wait` branch the lint check expects, because the user asked for work on `main`.
