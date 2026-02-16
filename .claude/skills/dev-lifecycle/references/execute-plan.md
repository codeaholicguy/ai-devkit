# Phase 4: Execute Plan

Work through a feature plan one task at a time, interactively.

## Step 1: Gather Context

Ask for:
- Feature name (kebab-case)
- Brief feature/branch description
- Planning doc path (default `docs/ai/planning/feature-{name}.md`)
- Supporting docs (design, requirements, implementation)
- Current branch and diff summary (`git status -sb`, `git diff --stat`)

## Step 2: Load the Plan

- Read the planning doc
- Parse task lists (headings + checkboxes `[ ]`, `[x]`)
- Build an ordered queue grouped by section (e.g., Foundation, Core, Testing)

## Step 3: Present Task Queue

```
### Task Queue: <Feature Name>
1. [status] Section - Task title
2. ...
```

Status legend: `todo`, `in-progress`, `done`, `blocked`

## Step 4: Interactive Task Execution

For each task:
1. Display section/context, full bullet text, and existing notes
2. Suggest relevant docs to reference (requirements/design/implementation)
3. Ask: "Plan for this task?" — offer to outline sub-steps from design doc
4. Prompt to mark status (`done`, `in-progress`, `blocked`, `skipped`) and capture notes
5. Offer commands/snippets when useful
6. If blocked, record blocker and move to end or "Blocked" list

## Step 5: Update Planning Doc

After each status change, generate a markdown snippet for the planning doc:
```
- [x] Task: Description (Notes: what was done)
```

## Step 6: Check for New Work

After each section, ask if new tasks were discovered. Capture in "New Work" list.

## Step 7: Session Summary

```
### Execution Summary
- Completed: (list)
- In Progress: (list + next steps)
- Blocked: (list + blockers)
- Skipped / Deferred: (list + rationale)
- New Tasks: (list)
```

## Step 8: Next Actions

Remind the user to:
- Update `docs/ai/planning/feature-{name}.md` with new statuses
- Sync related docs if decisions changed
- Run **Check Implementation** (Phase 5) to validate against design
- Run **Write Tests** (Phase 7) for coverage
- Run **Code Review** (Phase 6) when ready for final review
