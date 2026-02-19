---
name: dev-lifecycle
description: Structured SDLC workflow with 8 phases — requirements, design review, planning, implementation, testing, and code review. Use when the user wants to build a feature end-to-end, or run any individual phase (new requirement, review requirements, review design, execute plan, update planning, check implementation, write tests, code review).
---

# Dev Lifecycle

Sequential phases producing docs in `docs/ai/`. Flow: 1→2→3→4→(5 after each task)→6→7→8.

## Prerequisite

Before starting any phase, run `scripts/check-docs.sh` to verify the base `docs/ai/` structure exists. If it fails, run `npx ai-devkit init` first. Do not proceed until all checks pass.

For a **new feature start** (Phase 1 or `/new-requirement`), create and switch to a dedicated git worktree first:

1. Normalize feature name to kebab-case `<name>` (without prefix).
2. Use branch/worktree name `feature-<name>`.
3. Create worktree directory as sibling path `../feature-<name>`.
4. If branch does not exist: `git worktree add -b feature-<name> ../feature-<name>`.
5. If branch exists: `git worktree add ../feature-<name> feature-<name>`.
6. Continue all phase work inside that worktree.

## Phases

| # | Phase | Reference | When |
|---|-------|-----------|------|
| 1 | New Requirement | [references/new-requirement.md](references/new-requirement.md) | User wants to add a feature |
| 2 | Review Requirements | [references/review-requirements.md](references/review-requirements.md) | Requirements doc needs validation |
| 3 | Review Design | [references/review-design.md](references/review-design.md) | Design doc needs validation against requirements |
| 4 | Execute Plan | [references/execute-plan.md](references/execute-plan.md) | Ready to implement tasks from planning doc |
| 5 | Update Planning | [references/update-planning.md](references/update-planning.md) | Auto-trigger after completing any task in Phase 4 |
| 6 | Check Implementation | [references/check-implementation.md](references/check-implementation.md) | Verify code matches design |
| 7 | Write Tests | [references/writing-test.md](references/writing-test.md) | Add test coverage (100% target) |
| 8 | Code Review | [references/code-review.md](references/code-review.md) | Final pre-push review |

Load only the reference file for the current phase.

## Resuming Work

If the user wants to continue work on an existing feature, run `scripts/check-status.sh <feature-name>` to infer the current phase from doc state and planning progress. Start from the suggested phase.

## Backward Transitions

Not every phase moves forward. When a phase reveals problems, loop back:

- Phase 2 finds fundamental gaps → back to **Phase 1** to revise requirements
- Phase 3 finds requirements gaps → back to **Phase 2**; design doesn't fit → revise design in place
- Phase 6 finds major deviations → back to **Phase 3** (design wrong) or **Phase 4** (implementation wrong)
- Phase 7 tests reveal design flaws → back to **Phase 3**
- Phase 8 finds blocking issues → back to **Phase 4** (fix code) or **Phase 7** (add tests)

## Doc Convention

Feature docs: `docs/ai/{phase}/feature-{name}.md` (copy from `README.md` template in each directory, preserve frontmatter). Keep `<name>` aligned with the worktree/branch name `feature-<name>`.

Phases: `requirements/`, `design/`, `planning/`, `implementation/`, `testing/`.

## Memory Integration

Use `npx ai-devkit memory` CLI in any phase that involves clarification questions (typically Phases 1-3):

1. **Before asking questions**: `npx ai-devkit memory search --query "<topic>"`. Apply matches; only ask about uncovered gaps.
2. **After clarification**: `npx ai-devkit memory store --title "<title>" --content "<knowledge>" --tags "<tags>"`.

## Rules

- Read existing `docs/ai/` before changes. Keep diffs minimal.
- Use mermaid diagrams for architecture visuals.
- After each phase, summarize output and suggest next phase.
