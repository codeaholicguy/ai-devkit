---
phase: requirements
title: Durable agents managed by devkitd
---

# Durable agents managed by devkitd

## Problem Statement
Durable agents currently persist in agents.db and spawn providers in short-lived TS callers. Issue #414 requires devkitd to own durable persistence, provider execution, and reconciliation independently of CLI connections.

## Goals
- Store durable agents and runs in daemon.db, preserving identity, state, health, session, cwd, active token/processes, and last result.
- Serve durable.create/list/show/run/send/stop over the existing daemon socket.
- Route durable start/send/session/sessions CLI flows to the daemon, preserving output and ambiguity behavior.
- Define per-provider print/resume argv in start_profiles and validate protocol outcomes in Rust.
- Import legacy durable rows once with transactional retry and ownership fencing.

## Non-Goals
Interactive runtime changes; general transcript parsing; TS parsing workers; dual-write legacy bridge; mixed-version incremental import; guaranteed recovery of orphan exit codes/results across daemon death; real provider API calls in validation.

## User Stories
- As a CLI user I create a durable Claude/Codex/Pi identity, send prompts across runs, and browse its session without depending on the original caller.
- As a caller I disconnect without cancelling a run and can inspect the same run later.
- As an upgrading user I retain legacy IDs, session bindings, cwd, state, and results without duplicate execution.
- As an operator I stop a run and get truthful succeeded/failed/interrupted status after execution or restart.

## Success Criteria
R1: Agent/run transitions are atomic and token guarded; concurrent sends cannot overlap and stale completion cannot replace a newer run.
R2: Daemon launches all three providers with direct argv/stdin; protocol parity fixtures demonstrate session/completion/summary behavior and reject invalid streams.
R3: Same-daemon child exit/protocol outcome yields succeeded/failed/interrupted accurately; restart adopts by PID plus start identity, then marks unrecoverable death interrupted with null exit code.
R4: create/send/session/sessions use daemon state; exact ID wins, case-insensitive name ambiguity returns an array; cross-mode CLI ambiguity remains explicit.
R5: Only Codex binds session identity after creation, under active token; invalid/duplicate/mismatched sessions fail. Canonical cwd binding is checked before each run.
R6: Guarded import preserves rows and active ownership, retries without partial imports, and prevents stale local fallback after migration. No #413 dual-write pattern.
R7: Old-daemon/local fallback works only before ownership transfer. Transport failure after a mutation never retries locally.
R8: Stop targets only the current verified process, preserves agent/session, and is idempotent for idle agents.

## Constraints and Rollout
Use existing same-user socket trust boundary and bounded stream/result memory. Preserve TS repository as compatibility fallback. Preserve legacy database for recovery; updated clients honor persistent ownership fence. Older binaries writing after transfer and downgrade are unsupported. Durable capability stays unavailable on migration errors rather than exposing partial state. Missing legacy input is not a completed import.

## Validation
Rust cargo test, built dependencies plus npx nx test cli, new root e2e durable fixture flow, disposable smoke, lint and formatting. Tests never use provider APIs. Package TS tests stay under tests/ and E2E under root e2e/. No commit/push before phases pass; rebase origin/main then PR is the stop condition.

## Review / Open Questions
Reviewed against issue #414 and approved design. All three architecture decisions approved; no material open questions. Skills loaded: dev-requirements, dev-design, dev-worktree, memory, verify. Task tracing unavailable (CLI reports unknown command task).
