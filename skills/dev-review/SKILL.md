---
name: dev-review
description: AI DevKit · Final code review phase guidance for holistic pre-push review. Use when the user wants code review, final lifecycle review, design alignment checks, integration risk review, or dev-lifecycle phase 9.
---

# Dev Review

Run final pre-push review for configured AI docs features. Before changing docs or code, propose the concrete review plan and wait for user approval unless the user already approved the exact phase plan.

## Phase Contract

1. Run `npx ai-devkit@latest lint` before phase work.
2. If working on a named feature, run `npx ai-devkit@latest lint --feature <name>`.
3. Check `git status -sb` and `git diff --stat`.
4. Read feature docs and relevant changed files before findings.
5. Apply the `verify` skill before claiming readiness.
6. If parent `dev-lifecycle` established usable task tracing, emit review phase, progress, blocker/finding, next-step, and final evidence/readiness events per `task`.

## Code Review

Use for Phase 9. Take a holistic review stance: findings first, ordered by severity, grounded in file/line references.

1. Gather context: feature description, modified files, design docs, risky areas, tests already run.
2. Verify design alignment by summarizing architectural intent and checking implementation matches.
3. For each modified file, grep exported names to trace callers and dependents. Read relevant signatures, call sites, and type definitions.
4. Check consistency against 1-2 similar modules.
5. Search for existing utilities the new code could reuse or now duplicates. Flag near-matches honestly; do not force a wrong abstraction.
6. Verify contract integrity at API, type, config, and schema boundaries.
7. Check dependency health, including circular dependencies or version conflicts from new imports.
8. Check breaking changes. For public/external APIs, recommend parallel change and deprecation over in-place mutation. For in-repo-only callers, in-place modification with all callers updated is acceptable.
9. Check rollback safety, especially irreversible migrations or one-way data/state changes.
10. Review file by file for correctness, logic, edge cases, redundancy, security, performance, error handling, and test coverage.
11. Check cross-cutting concerns: naming conventions, documentation updates, missing tests, config/migration changes.
12. Summarize blocking issues, important follow-ups, and nice-to-haves. Per finding include file, issue, impact severity, and recommendation.
13. If task tracing is available, add blockers and set `blocked` for blocking findings; if review passes with final evidence, close the task per `task`.
14. Complete final checklist: design match, no logic gaps, security addressed, integration points verified, tests cover changes, docs updated.

Done: if the checklist passes, the feature is ready to push and create a PR. If blocking issues remain, return to `dev-implementation` or `dev-testing`.
