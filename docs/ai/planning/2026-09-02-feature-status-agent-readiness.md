---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones
**What are the major checkpoints?**

- [x] Milestone 1: Capture requirements/design/test plan for all-adapter readiness.
- [x] Milestone 2: Move agent checks into `agent-manager` and update CLI orchestration.
- [x] Milestone 3: Verify tests, builds, feature lint, and final review.

## Task Breakdown
**What specific work needs to be done?**

### Phase 1: Foundation
- [x] Task 1.1: Add `agent-manager` readiness API and tests for all startable adapters.
- [x] Task 1.2: Export readiness API from `@ai-devkit/agent-manager`.

### Phase 2: Core Features
- [x] Task 2.1: Replace CLI-local agent readiness code with `agent-manager` readiness calls.
- [x] Task 2.2: Render agent checks dynamically while preserving labels for hooks, plugin, built-in skills, and Pi providers.

### Phase 3: Integration & Polish
- [x] Task 3.1: Remove obsolete CLI-local tests and add focused coverage for the new contract.
- [x] Task 3.2: Run targeted tests, package builds, feature lint, and final diff review.

## Progress Summary

Implementation completed on 2026-09-02. The CLI now delegates adapter readiness to `@ai-devkit/agent-manager`, renders all startable adapters dynamically, and keeps unsupported auth/integration checks absent rather than warning.

## Dependencies
**What needs to happen in what order?**

- Task 2.1 depends on Task 1.1 API shape.
- Task 2.2 depends on `StatusReport.agents` becoming dynamic.
- No external services are required except optional local CLI probes used in tests through injection.

## Timeline & Estimates
**When will things be done?**

- Target date: 2026-09-02.
- Expected effort: one focused implementation pass plus targeted validation.

## Risks & Mitigation
**What could go wrong?**

- Risk: expanding `agents` breaks strict tests or downstream JSON consumers. Mitigation: keep Codex/Pi/Claude keys stable and update types/tests intentionally.
- Risk: generic adapters get misleading failures. Mitigation: omit unsupported auth/integration checks.
- Risk: status remains slow because `pi list` dominates. Mitigation: parallelize independent probes without adding cache or new commands.

## Resources Needed
**What do we need to succeed?**

- Codex agent implements and verifies.
- User reviews final outcome before push.
