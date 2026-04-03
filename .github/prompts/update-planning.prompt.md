---
description: Update planning docs to reflect implementation progress.
---

Help me reconcile current implementation progress with the planning documentation.

1. **Gather Context** — If not already provided, ask for: feature/branch name and brief status, tasks completed since last update, new tasks discovered, current blockers or risks, and planning doc path (default `docs/ai/planning/feature-{name}.md`).
2. **Use Memory for Context** — Search memory for prior decisions that affect priorities/scope: `npx ai-devkit@latest memory search --query "<feature planning updates>"`.
3. **Review & Reconcile** — Summarize existing milestones, task breakdowns, and dependencies from the planning doc. For each planned task: mark status (done / in progress / blocked / not started), note scope changes, record blockers, identify skipped or added tasks.
4. **Produce Updated Task List** — Generate an updated checklist grouped by: Done, In Progress, Blocked, Newly Discovered Work — with short notes per task.
5. **Store Reusable Knowledge** — If new planning conventions or risk-handling rules emerge, store them with `npx ai-devkit@latest memory store ...`.
6. **Next Steps & Summary** — Suggest the next 2-3 actionable tasks and prepare a summary paragraph for the planning doc.
7. **Next Command Guidance** — Return to `/execute-plan` for remaining work. When all implementation tasks are complete, run `/check-implementation`.
