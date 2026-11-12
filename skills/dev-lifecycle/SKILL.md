---
name: dev-lifecycle
description: AI DevKit · Orchestrator for structured SDLC phase skills. Use when the user wants to run the full lifecycle or choose the next phase across requirements, design, planning, implementation, testing, and review.
---

# Dev Lifecycle

Coordinate the phase-specific AI DevKit skills instead of running phase details directly.

Required phase skills:

- `dev-worktree` for feature workspace setup and resume.
- `dev-requirements` for phases 1-2: new requirement and requirements review.
- `dev-design` for phase 3: design review.
- `dev-planning` for phases 4 and 6: initial task planning and updates after implementation tasks.
- `dev-implementation` for phases 5 and 7: execute plan and check implementation.
- `dev-testing` for phase 8: write tests and verify coverage.
- `dev-review` for phase 9: final code review.

Supporting skills:

- `memory` for reusable project knowledge during clarification.
- `tdd` for implementation tasks.
- `verify` before completing implementation, implementation checks, testing claims, and review readiness.
- `dev-smoke` after Write Tests and before Code Review for user-facing changes.
- `dev-simplify` after Implementation Check (phase 7) or before Code Review (phase 9) when the change is large or shows complexity smells (many new abstractions, repeated implementation friction, deep nesting). Interactive mode: offer the analysis and apply the plan only with user agreement. Autonomous mode: run the analysis always; apply the safe tier per Autonomous Operation; carry the rest as proposals in the PR.
- `dev-retro` after Code Review or PR: interactive mode offers it and runs only with agreement; autonomous mode runs it and attaches the outcome to the PR or feature docs.
- `task` for optional progress tracing when the task command is usable.

## Startup Validation

At the beginning of every `dev-lifecycle` run:

1. Run `npx ai-devkit@latest skill list` to inspect currently installed project skills.
2. Confirm the listed skills include all required phase skills and supporting skills.
3. If any required skill is missing, run `npx ai-devkit@latest skill add --built-in` to install all AI DevKit built-in skills. Then rerun `npx ai-devkit@latest skill list`.
4. If installation fails or a required skill is still missing, stop and report the missing skill names and command output summary. Do not run a phase without its skill.
5. Run `npx ai-devkit@latest lint` to verify the configured AI docs structure.
6. If working on a specific feature, run `npx ai-devkit@latest lint --feature <name>`.
7. If lint fails because project docs are not initialized, run `npx ai-devkit@latest init -a -e claude --built-in --yes`, then rerun lint.
8. Probe optional task tracing availability:
   - With a feature: `npx ai-devkit@latest task list --name <feature-name> --json`
   - Without a feature: `npx ai-devkit@latest task list --json`
   - Treat task tracing as available only if the read probe exits 0. If it fails, record task tracing as unavailable with the failed command and reason, then continue without task logging.
   - Never block lifecycle work only because the task command is missing or unusable.
9. When working on a specific feature and task tracing is available:
   - Load and follow `task` before executing a phase.
   - Initialize or show the task named after the feature, mark active work, and emit phase/progress/next/blocker/evidence events per `task`.
   - Sequence task mutations; do not batch or parallelize mutations for the same feature.

## Plan Before Execution

Before executing any phase:

1. Identify the target feature, current docs state, branch/worktree context, and likely next phase.
2. Propose a concise plan that names the phase skill to use, the docs/files to read, commands to run, expected edits, task tracing status and planned task events if tracing is available, and verification evidence.
3. Wait for user approval before executing the plan unless the user already gave explicit approval for that exact phase execution, or Autonomous Operation is active and the plan stays within its rules.
4. After approval, load and follow only the selected phase skill plus any explicitly required supporting skills. If tracing is available, the `task` skill is explicitly required.

## Autonomous Operation

Autonomous mode produces a reviewable PR end-to-end without pausing for consent. Activate only by explicit user instruction (for example "run autonomously" or "produce the PR without asking") or a standing pre-approval naming the feature scope. Default remains interactive.

Gate conversions while active:

- Phase plan approval: proceed without pause while the plan stays inside the pre-approved feature scope; record the plan in the phase summary. Stop and ask on scope deviation, ambiguity, or destructive operations.
- `dev-simplify`: always run the analysis (read-only). Auto-apply only the safe tier — no public/external API or contract changes, no new dependencies, full test suite green before and after, and `dev-smoke` parity at entry points when applicable. All other proposals go into the PR as "Proposed simplifications (not applied)" with before/after snippets.
- `dev-retro`: run it; attach the outcome to the PR body or feature docs.
- `dev-smoke`: unchanged — it is already criteria-based.

Terminal condition: opening the PR ends the autonomous run. Never merge, publish, force-push, delete branches, or change repository settings autonomously; those remain explicitly human. Every phase still requires fresh verification evidence, and unmet validation gates stop the run with a blocker report instead of a degraded PR.

## Phase Routing

| Phase | Route to | When |
|---|---|---|
| Setup. Workspace | `dev-worktree` | Starting or resuming feature work |
| 1. New Requirement | `dev-requirements` | User wants to add a feature or start `/new-requirement` |
| 2. Review Requirements | `dev-requirements` | Requirements doc needs validation |
| 3. Review Design | `dev-design` | Design doc needs validation against requirements |
| 4. Create Initial Plan | `dev-planning` | Requirements, design, and testing docs are ready for task breakdown |
| 5. Execute Plan | `dev-implementation` | Ready to implement tasks from planning doc |
| 6. Update Planning | `dev-planning` | Auto-trigger after completing any implementation task |
| 7. Check Implementation | `dev-implementation` | Verify code matches design and docs |
| 8. Write Tests | `dev-testing` | Add or verify test coverage |
| 9. Code Review | `dev-review` | Final pre-push review |

Sequential flow: setup -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 after each completed task -> 7 -> 8 -> 9.

## Resuming Work

If the user wants to continue work on an existing feature:

1. Use `dev-worktree` to identify and confirm the target branch/worktree.
2. Run `npx ai-devkit@latest lint --feature <feature-name>` in the active context.
3. Run the phase detector from the installed `dev-lifecycle` skill directory:
   - Resolve `<skill-dir>` as the directory containing this `SKILL.md`.
   - Run `<skill-dir>/scripts/check-status.sh <feature-name>`.
   - Use the suggested phase when proposing the execution plan.

## Backward Transitions

Not every phase moves forward. When a phase reveals problems, route back:

- Requirements review finds fundamental gaps: return to `dev-requirements` Phase 1.
- Design review finds requirements gaps: return to `dev-requirements` Phase 2.
- Design review finds design flaws: stay in `dev-design` and revise design.
- Implementation check finds major deviations: return to `dev-design` if design is wrong, or `dev-implementation` if code is wrong.
- Testing reveals design flaws: return to `dev-design`.
- Review finds blocking issues: return to `dev-implementation` or `dev-testing`.
- Smoke check finds a regression: return to `dev-implementation`.

## Rules

- Use `npx ai-devkit@latest lint` and `npx ai-devkit@latest lint --feature <name>` to discover and validate the configured docs directory. Do not assume `docs/ai`; it is only the default.
- Read existing configured AI docs before changes. Keep diffs minimal.
- Keep feature names aligned with branch/worktree `feature-<name>`.
- New feature docs come from `npx ai-devkit@latest docs init-feature <name>`. Use the paths returned by the command as authoritative.
- Existing feature docs are the paths reported or validated by `npx ai-devkit@latest lint --feature <name>`. If you must infer manually, first resolve the configured docs directory from `.ai-devkit.json` `paths.docs`, falling back to `docs/ai`.
- After each phase, summarize output and suggest the next phase.
- Do not claim completion without fresh verification evidence.
- When task tracing is available, follow `task`: create once, assign actor when known, mark active/blocked, set phase, record progress/next/evidence, and close only after final verification/review. If tracing is unavailable, include failed probe commands in the phase summary without blocking the lifecycle.
