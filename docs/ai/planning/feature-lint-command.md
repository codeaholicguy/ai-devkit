---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones
**What are the major checkpoints?**

- [x] Milestone 1: Lint requirements/design approved
- [x] Milestone 2: `ai-devkit lint` base + feature checks implemented
- [x] Milestone 3: Tests, docs, and rollout complete

## Task Breakdown
**What specific work needs to be done?**

### Phase 1: Foundation
- [x] Task 1.1: Audit current CLI command registration and identify insertion point for `lint`
- [x] Task 1.2: Extract/reimplement `check-docs.sh` base and feature doc checks in TypeScript utilities
- [x] Task 1.3: Implement feature-name normalization utility (`foo` and `feature-foo` -> `foo`)
- [x] Task 1.4: Define shared lint result model and formatter (`ok/miss/warn`, remediation hints)

### Phase 2: Core Features
- [x] Task 2.1: Add `ai-devkit lint` command handler with base workspace checks
- [x] Task 2.2: Add `--feature <name>` mode with feature doc checks across all lifecycle phases
- [x] Task 2.3: Add git checks for `feature-<name>` branch/worktree presence and mapping
- [x] Task 2.4: Ensure proper exit codes and summary output for CI compatibility

### Phase 3: Integration & Polish
- [x] Task 3.1: Update help text and README command documentation
- [x] Task 3.2: Decide whether to keep `skills/dev-lifecycle/scripts/check-docs.sh` as wrapper or migrate references to `ai-devkit lint`
- [x] Task 3.3: Add actionable remediation guidance in failures (`npx ai-devkit@latest init`, worktree creation command)
- [x] Task 3.4: Validate behavior against existing lifecycle docs and feature naming conventions

### Phase 4: Validation
- [x] Task 4.1: Unit tests for base docs checks and feature docs checks
- [x] Task 4.2: Unit tests for feature normalization and git/worktree validation logic
- [x] Task 4.3: Integration tests for CLI exit codes and terminal output
- [x] Task 4.4: Manual verification on repositories with and without required docs/worktrees

## Dependencies
**What needs to happen in what order?**

- Task dependencies and blockers
  - Command registration and result model must be in place before integration tests.
  - Feature-name normalization should be implemented before feature doc and git checks.
  - Git check module should be stable before finalizing remediation messages.
- External dependencies (APIs, services, etc.)
  - Local git executable availability for feature-level checks.
- Team/resource dependencies
  - Maintainer review for lifecycle workflow compatibility and naming conventions.

## Timeline & Estimates
**When will things be done?**

- Estimated effort per task/phase
  - Phase 1: 0.5-1 day
  - Phase 2: 1-1.5 days
  - Phase 3: 0.5 day
  - Phase 4: 0.5-1 day
- Target dates for milestones
  - Milestone 1: day 1
  - Milestone 2: day 2-3
  - Milestone 3: day 3-4
- Buffer for unknowns
  - +20% for git/worktree edge-case handling and cross-platform output differences

## Risks & Mitigation
**What could go wrong?**

- Technical risks
  - Git worktree detection may vary by repo state and user flow.
  - Divergence between shell script and new TypeScript checks can cause inconsistent behavior.
- Resource risks
  - Limited test coverage for unusual git/worktree layouts.
- Dependency risks
  - Existing scripts or docs may still assume `check-docs.sh` behavior/output.
- Mitigation strategies
  - Add fixture-based tests for multiple git states.
  - Keep output mapping close to existing `check-docs.sh` semantics initially.
  - Update docs and scripts in same change to avoid workflow drift.

## Resources Needed
**What do we need to succeed?**

- Team members and roles
  - CLI implementer and reviewer
- Tools and services
  - Existing TypeScript unit/integration test tooling
- Infrastructure
  - Local git repo fixtures for worktree tests
- Documentation/knowledge
  - Dev-lifecycle skill conventions and existing `check-docs.sh` behavior
