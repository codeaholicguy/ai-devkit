---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

**What problem are we solving?**

- `ai-devkit` currently has no single validation command to confirm whether the current directory is ready to run AI DevKit workflows.
- Users can start lifecycle phases in misconfigured directories (missing `docs/ai` templates, missing feature docs, or missing feature worktree), which leads to late failures and confusion.
- Existing validation logic is partially implemented in `skills/dev-lifecycle/scripts/check-docs.sh`, but it is not exposed as a first-class CLI command.
- Who is affected:
  - Contributors running `dev-lifecycle` commands manually.
  - New users onboarding to AI DevKit workflow conventions.
  - Teams needing a deterministic readiness check in local and CI workflows.

## Goals & Objectives

**What do we want to achieve?**

- Primary goals
  - Add a new command: `ai-devkit lint`.
  - Validate base workspace readiness for AI DevKit workflows (presence of required `docs/ai/*/README.md` files).
  - Add feature-scoped mode: `ai-devkit lint --feature <name>`.
  - Accept `--feature foo` and `--feature feature-foo`, normalizing both to `foo`.
  - In feature mode, verify both:
    - Feature docs exist across lifecycle phases.
    - Dedicated git worktree/branch conventions are evaluated before execution phase.
  - Return clear pass/fail output and non-zero exit code on failures.
  - Support optional machine-readable output via `--json`.
- Secondary goals
  - Reuse or extract logic from `skills/dev-lifecycle/scripts/check-docs.sh` to avoid duplicated validation rules.
  - Make output consistent with existing CLI UX (readable statuses, actionable next steps).
- Non-goals (what's explicitly out of scope)
  - Auto-generating missing docs/worktrees as part of `lint`.
  - Validating full implementation/test completeness of a feature.
  - Enforcing remote repository policies (PR checks, branch protections).
  - Verifying skill script presence beyond docs/worktree prerequisites.

## User Stories & Use Cases

**How will users interact with the solution?**

- As a contributor, I want to run `ai-devkit lint` before starting lifecycle work so that I can catch setup problems early.
- As a contributor working on a feature branch, I want `ai-devkit lint --feature sample-feature-name` so that I can ensure docs and worktree setup are correct before execution.
- As a CI maintainer, I want reliable exit codes and optional JSON output so that pipeline steps can block invalid workflow state and parse results.
- Key workflows and scenarios
  - Run `ai-devkit lint` in project root to validate base `docs/ai` structure.
  - Run `ai-devkit lint --feature lint-command` to validate feature docs and `feature-lint-command` worktree status.
  - Run lint before `execute-plan` to ensure prerequisites are met.
- Edge cases to consider
  - Command executed outside project root.
  - Feature name provided with or without `feature-` prefix.
  - Branch exists but worktree directory is missing.
  - Worktree exists but points to unexpected branch.
  - Partial doc presence across phases.

## Success Criteria

**How will we know when we're done?**

- Measurable outcomes
  - `ai-devkit lint` completes in under 1 second for normal repositories.
  - Validation failures provide explicit missing paths and corrective commands.
- Acceptance criteria
  - `ai-devkit lint` checks base structure equivalent to current `check-docs.sh` base check.
  - `ai-devkit lint --feature <name>` checks all required `docs/ai/{phase}/feature-<name>.md` files.
  - `ai-devkit lint --feature <name>` checks dedicated worktree/branch convention (`feature-<name>`).
  - Missing dedicated worktree returns a warning, not a hard failure.
  - Command exits `0` when all required checks pass and non-zero when required checks fail.
  - Output includes recommended remediation (for example `npx ai-devkit init` or worktree creation commands).
  - `--json` returns machine-readable structured results for CI tooling.
- Performance benchmarks (if applicable)
  - File-system checks and git checks should avoid expensive scans and run in sub-second to low-second range.

## Constraints & Assumptions

**What limitations do we need to work within?**

- Technical constraints
  - Must work with existing AI DevKit CLI architecture and command registration.
  - Git checks should handle repositories with multiple worktrees.
  - Should support macOS/Linux/Windows path behavior for workspace checks.
- Business constraints
  - Must preserve existing behavior of lifecycle scripts while adding a reusable lint interface.
- Time/budget constraints
  - Prioritize deterministic validations first; defer advanced diagnostics/report formats beyond `--json`.
- Assumptions we're making
  - Repository uses the documented phase structure under `docs/ai/`.
  - Feature lifecycle convention remains `feature-<name>` for branch and worktree naming.
  - Users run the command from within a git repository for feature-level checks.

## Questions & Open Items

**What do we still need to clarify?**

- No blocking open items for Phase 2.
