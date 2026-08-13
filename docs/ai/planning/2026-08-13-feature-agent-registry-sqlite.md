---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones

- [x] Milestone 1: SQLite registry storage implemented.
- [x] Milestone 2: Name-preservation and concurrency regressions covered by tests.
- [x] Milestone 3: Focused verification, docs lint, final review, and PR delivered.

## Task Breakdown

### Phase 1: Storage Foundation

- [x] Task 1.1: Replace JSON read/write implementation in `AgentRegistry` with SQLite schema initialization and row mapping.
- [x] Task 1.2: Skip legacy `agents.json` import and let live discovery/start registration repopulate SQLite.
- [x] Task 1.3: Preserve the existing public `AgentRegistry` constructor/API so call sites remain stable.
- [x] Task 1.4: Extract SQLite connection and schema concerns into `src/database/*` following the memory/task package pattern.
- [x] Task 1.5: Move schema DDL into numbered SQL migrations and copy migrations during package build.

### Phase 2: Merge Semantics

- [x] Task 2.1: Implement PID-aware upsert that preserves custom names and tmux metadata.
- [x] Task 2.2: Ensure `agent start` style entries with non-empty `tmuxSession` can claim a same-PID generated fallback row.
- [x] Task 2.3: Keep `rename`, `lookup`, `list`, and `prune` semantics compatible with existing CLI behavior.

### Phase 3: Tests and Validation

- [x] Task 3.1: Update `AgentRegistry` unit tests for SQLite behavior and ignored legacy JSON.
- [x] Task 3.2: Add `AgentManager` regression tests for repeated `listAgents()` name stability.
- [x] Task 3.3: Run focused tests, typecheck, package lint, AI docs lint, and final git diff review.
- [x] Task 3.4: Commit, push branch, and open/update a PR.

## Dependencies

- Existing `better-sqlite3` dependency in `@ai-devkit/agent-manager`.
- Existing process liveness check via `process.kill(pid, 0)`.
- Existing CLI and adapter callers must continue using `AgentRegistry` without redesign.

## Timeline & Estimates

- Storage setup: medium risk, targeted to one module.
- Merge semantics: medium risk because name conflict behavior is user-visible.
- Tests and validation: medium effort because several existing tests assert JSON-file details.

## Risks & Mitigation

- Risk: existing tests rely on `agents.json` file creation.
  - Mitigation: update tests to assert registry behavior rather than storage format where possible.
- Risk: `UNIQUE(name)` conflicts with stale rows.
  - Mitigation: keep existing prune-before-start flow and rename conflict checks.
- Risk: pre-upgrade managed tmux metadata exists only in `agents.json`.
  - Mitigation: accept this as local ephemeral state; live discovery and new `agent start` calls populate SQLite going forward.

## Resources Needed

- Local npm workspace with dependencies installed.
- GitHub CLI or git remote access for PR delivery.
