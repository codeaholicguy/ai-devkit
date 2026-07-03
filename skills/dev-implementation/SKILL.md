---
name: dev-implementation
description: AI DevKit · Implementation phase guidance for executing feature plans and checking implementation against design. Use when the user wants to implement planned tasks, update implementation docs, verify code matches design, or run dev-lifecycle phases 5 and 7.
---

# Dev Implementation

Run implementation work for configured AI docs features. Before changing docs or code, propose the concrete plan for this phase and wait for user approval unless the user already approved the exact phase plan.

## Phase Contract

1. Run `npx ai-devkit@latest lint` before phase work.
2. If working on a named feature, run `npx ai-devkit@latest lint --feature <name>`.
3. Read requirements, design, planning, implementation, and testing docs before changes.
4. Use the `tdd` skill while executing implementation tasks: write a failing test before production code, then make it pass.
5. Apply the `verify` skill before completing tasks or making implementation alignment claims.
6. Keep testing and implementation docs in lockstep with code. Do not defer all doc updates to final verification.
7. If parent `dev-lifecycle` established usable task tracing, emit phase, progress, next-step, blocker, and evidence events per `task`.

## Execute Plan

Use for Phase 5.

1. Run `npx ai-devkit@latest lint --feature <name>` and work through the planning doc path it validates. If manual path resolution is unavoidable, first resolve `.ai-devkit.json` `paths.docs`, falling back to `docs/ai`.
2. Gather context: feature name, planning doc path, supporting docs, current branch, and current diff.
3. Parse task lists and build an ordered queue by section.
4. Present the task queue with status: `todo`, `in-progress`, `done`, `blocked`.
5. For each task, show context, suggest relevant docs, and outline sub-steps from the design doc when useful.
6. If task tracing is available, record current task progress and immediate next action per `task`.
7. Reuse before writing: grep for existing utilities/functions before adding new ones. Reuse only if it fits cleanly.
8. Handle breaking changes carefully: update all in-repo callers atomically; for external/public/cross-service callers, add a new function and deprecate the old one.
9. Generate a markdown tracking snippet after each status change.
10. After each task, update the testing doc with completed scenarios, newly discovered scenarios, and invalidated scenarios. Update the implementation doc with changed files, decisions, design deviations, and edge cases handled.
11. After each section, ask if new tasks were discovered.
12. Summarize completed, in-progress, blocked, skipped, new tasks, task-tracing events emitted or why tracing was unavailable, and doc deltas.

Next: after completing any task, run `dev-planning` Phase 6. When all tasks are done, run Check Implementation, then `dev-testing` and `dev-review`.

## Check Implementation

Use for Phase 7.

1. Compare implementation against the configured design and requirements docs validated by `npx ai-devkit@latest lint --feature <name>`.
2. Gather context: feature description, modified files, relevant design/requirements docs, constraints.
3. Summarize design: key decisions, components, interfaces, data flows.
4. Review file by file: verify design intent, note deviations, flag logic gaps, edge cases, security issues, and missing tests or doc updates.
5. Finalize the implementation doc. Verify it captures what shipped, fill gaps, and record follow-ups.
6. Summarize alignment status, deviations with severity, missing pieces, concerns, and next steps.

Next: `dev-testing`, then `dev-review`. If major deviations exist, return to `dev-design` if design is wrong or Execute Plan if implementation is wrong.
