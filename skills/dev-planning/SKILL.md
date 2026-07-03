---
name: dev-planning
description: AI DevKit · Planning phase guidance for creating and reconciling feature task plans. Use when the user wants to create an implementation plan, update planning docs, mark task progress, capture blockers or new tasks, or run dev-lifecycle planning work.
---

# Dev Planning

Run planning creation and reconciliation for configured AI docs features. Before changing docs, propose the concrete plan for this phase and wait for user approval unless the user already approved the exact phase plan.

## Phase Contract

1. Run `npx ai-devkit@latest lint` before phase work.
2. If working on a named feature, run `npx ai-devkit@latest lint --feature <name>`.
3. Read existing configured planning, implementation, and testing docs before changes. Resolve paths through `lint --feature` instead of assuming `docs/ai`.
4. Keep task creation and updates traceable to requirements, design, testing scenarios, completed work, blockers, or newly discovered scope.
5. If parent `dev-lifecycle` established usable task tracing, emit planning phase, progress, blocker/scope, and next-step events per `task`.

## Create Initial Plan

Use for Phase 4 after requirements, design, and initial testing docs exist.

1. Run `npx ai-devkit@latest lint --feature <name>` and identify the planning doc path it validates. If `docs init-feature` just ran, use the returned planning path as authoritative.
2. Read requirements, design, and testing docs for the feature.
3. Convert goals, user stories, design components, API/data changes, migration needs, and testing scenarios into implementation tasks.
4. Group tasks by milestone or logical sequence.
5. For each task, include outcome, dependencies, validation evidence, and related testing scenarios.
6. Verify every test-plan scenario has at least one implementation task.
7. Add risks, blockers, sequencing notes, and likely follow-up checks.
8. Update the planning doc with the initial ordered task list.
9. If task tracing is available, record plan progress and next implementation step per `task`.

Next: `dev-implementation`.

## Update Planning

Use for Phase 6. Auto-trigger this phase after completing any task in `dev-implementation`.

1. Run `npx ai-devkit@latest lint --feature <name>` and reconcile the planning doc path it validates. If manual path resolution is unavoidable, first resolve `.ai-devkit.json` `paths.docs`, falling back to `docs/ai`.
2. If continuing from implementation, carry forward existing context. Otherwise ask for feature name, completed tasks, new tasks, blockers, and planning doc path.
3. Review existing milestones, sequencing, dependencies, and outstanding tasks.
4. Reconcile each task: mark status as done, in-progress, blocked, or not started; note scope changes; record blockers; capture skipped or added tasks.
5. Update the planning doc with the current status checklist.
6. Suggest the next 2-3 actionable tasks, risky areas, and coordination needed.
7. If task tracing is available, record completed/blocked/new tasks, blockers, and next action per `task`.
8. Write a summary paragraph for the planning doc covering progress, risks, upcoming focus, and scope changes.

Next: if tasks remain, return to `dev-implementation`. If all done, run implementation verification before testing and review.
