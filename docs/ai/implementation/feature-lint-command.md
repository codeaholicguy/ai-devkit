---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup
**How do we get started?**

- `npm install` at repository root.
- CLI package local validation commands:
  - `npm run lint` (from `packages/cli`)
  - `nx run cli:test -- --runInBand lint.test.ts` (from repo root)

## Code Structure
**How is the code organized?**

- `packages/cli/src/cli.ts`
  - Registers new `lint` command and options (`--feature`, `--json`).
- `packages/cli/src/commands/lint.ts`
  - Command entrypoint that runs checks, renders output, and sets process exit code.
- `packages/cli/src/services/lint/lint.service.ts`
  - Core lint orchestration and business logic only (no terminal rendering).
- `packages/cli/src/services/lint/rules/`
  - Rule modules split by concern (`base-docs`, `feature-name`, `feature-docs`, `git-worktree`).
- `packages/cli/src/__tests__/services/lint/lint.test.ts`
  - Unit coverage for normalization and check outcomes.
- `packages/cli/src/__tests__/commands/lint.test.ts`
  - Command-level coverage for orchestration and exit-code behavior.

## Implementation Notes
**Key technical details to remember:**

### Core Features
- Base readiness checks validate `docs/ai/{requirements,design,planning,implementation,testing}/README.md`.
- Feature mode normalizes `feature-<name>` and `<name>` into a shared `normalizedName`.
- Feature names are validated as kebab-case before running feature-level checks.
- Feature mode validates lifecycle docs:
  - `docs/ai/{phase}/feature-<normalizedName>.md`
- Git validation behavior:
  - Missing git repository => required failure.
  - Missing `feature-<name>` branch => required failure.
  - Missing dedicated worktree for branch => warning only.
- Reporter supports:
  - human-readable checklist output
  - JSON report output with summary and per-check metadata

### Patterns & Best Practices
- `runLintChecks` accepts injected dependencies (`cwd`, `existsSync`, `execFileSync`) for testability.
- Check results use a normalized shape (`LintCheckResult`) so rendering and JSON use one source of truth.
- Required failures drive exit code; warnings are advisory only.

## Integration Points
**How do pieces connect?**

- CLI wiring: Commander action in `packages/cli/src/cli.ts` calls `lintCommand`.
- `lintCommand` delegates to `runLintChecks` then `renderLintReport`.
- `lint.service` composes rule modules and uses `util/git` sync helpers to query `git rev-parse`, `git show-ref`, and `git worktree list --porcelain`.
- `commands/lint` owns `renderLintReport` and uses `util/terminal-ui` for consistent user-facing output.

## Error Handling
**How do we handle failures?**

- Git command failures are converted into deterministic lint results (miss or warn), not thrown errors.
- Missing files are reported with explicit path and remediation guidance.
- Output includes suggested fixes (for example `npx ai-devkit init`, `git worktree add ...`).

## Performance Considerations
**How do we keep it fast?**

- Uses direct existence checks and small git commands only.
- No recursive repository scans or network calls.

## Security Notes
**What security measures are in place?**

- Read-only filesystem and git metadata checks only.
- No mutation of repository state.
- Git commands use argument-based process execution (`execFileSync`) to avoid shell interpolation risks from user input.

## Phase 6 Check Implementation

- Design/requirements alignment: aligned for command surface, normalization, check categories, and exit behavior.
- Deviations and gaps:
  - Full CLI binary execution via `npm run dev -- lint ...` is currently blocked by unrelated pre-existing TypeScript errors in `src/commands/memory.ts`.

## Phase 8 Code Review

- Blocking issue found and resolved:
  - `packages/cli/src/services/lint/lint.service.ts`: replaced shell-command interpolation with argument-based git execution and added feature-name validation.
- Remaining non-blocking gap:
  - Full CLI binary execution remains blocked by unrelated pre-existing TypeScript issues outside this feature.
