---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones

- [x] Milestone 1: Validate sandbox deletion and host re-registration live.
- [x] Milestone 2: Implement prune, continuity, and kill fixes using TDD.
- [x] Milestone 3: Complete lifecycle verification and publish a PR.

## Task Breakdown
**What specific work needs to be done?**

### Phase 1: Registry safety
- [x] Add failing tests for managed tmux-aware pruning and stale cleanup.
- [x] Implement injectable tmux-session liveness in `AgentRegistry`.

### Phase 2: Identity continuity
- [x] Add failing PID-rollover tests using stable provider session identity.
- [x] Implement guarded, atomic registry continuity without duplicate rows.

### Phase 3: Kill cleanup
- [x] Add failing tests for capture-before-refresh and already-gone providers.
- [x] Implement capture-first kill behavior and verify command integration.

### Phase 4: Documentation and gates
- [x] Update implementation/testing evidence and reconcile this plan.
- [x] Run regression reversal, package/full tests, build, lint, and e2e.
- [x] Review, commit, rebase, push, and open PR #205 without merging.

## Progress Summary

Implementation, validation, final review, and publication are complete. Scope
remained aligned with the approved three-part fix. PR #205 is open and was not
merged as part of this work.

## Dependencies
**What needs to happen in what order?**

- Prune safety precedes live-registry validation.
- Continuity and kill changes are independent after registry APIs are defined.
- Task tracing is unavailable in CLI 0.56.0 (`unknown command 'task'`).

## Timeline & Estimates
**When will things be done?**

- Complete in this feature worktree during the current debugging session.

## Risks & Mitigation
**What could go wrong?**

- Tmux probing could add refresh cost: probe only ESRCH managed rows.
- Session IDs may be empty or ambiguous: reject those matches.
- Kill fallback could target unrelated sessions: use only exact registry mappings
  captured before refresh, never arbitrary partial tmux names.

## Resources Needed
**What do we need to succeed?**

- Existing Vitest suites, SQLite fixtures, `TmuxManager`, and CLI e2e harness.
