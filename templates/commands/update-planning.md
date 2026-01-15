---
description: Assist in updating planning documentation to reflect current implementation progress for a feature.
---

# Planning Update Assistant

Please help me reconcile the current implementation progress with our planning documentation.

## Step 1: Gather Context
Ask me for:
- Feature/branch name and brief status
- Tasks completed since last update
- Any new tasks discovered
- Current blockers or risks
- Relevant planning docs (e.g., `docs/ai/planning/feature-{name}.md`)

## Step 2: Review Planning Doc
If a planning doc exists:
- Summarize existing milestones and task breakdowns
- Note expected sequencing and dependencies
- Identify outstanding tasks in the plan

## Step 3: Reconcile Progress
For each planned task:
- Mark status (done / in progress / blocked / not started)
- Note actual work completed vs. planned scope
- Record blockers or changes in approach
- Identify tasks that were skipped or added

## Step 4: Update Task List
Help me produce an updated checklist such as:
```
### Current Status: [Feature Name]

#### Done
- [x] Task A - short note on completion or link to commit/pr
- [x] Task B

#### In Progress
- [ ] Task C - waiting on [dependency]

#### Blocked
- [ ] Task D - blocked by [issue/owner]

#### Newly Discovered Work
- [ ] Task E - reason discovered
- [ ] Task F - due by [date]
```

## Step 5: Next Steps & Priorities
- Suggest the next 2-3 actionable tasks
- Highlight risky areas needing attention
- Recommend coordination (design changes, stakeholder sync, etc.)
- List documentation updates needed

## Step 6: Summary for Planning Doc
Prepare a summary paragraph to copy into the planning doc, covering:
- Current state and progress
- Major risks/blockers
- Upcoming focus items
- Any changes to scope or timeline

---
Let me know when you're ready to begin the planning update.

