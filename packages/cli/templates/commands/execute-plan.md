---
description: Execute a feature plan task by task.
---

Help me work through a feature plan one task at a time.

1. **Gather Context** — If not already provided, ask for: feature name (kebab-case, e.g., `user-authentication`), brief feature/branch description, planning doc path (default `docs/ai/planning/feature-{name}.md`), and any supporting docs (design, requirements, implementation).
2. **Load & Present Plan** — Read the planning doc and parse task lists (headings + checkboxes). Present an ordered task queue grouped by section, with status: `todo`, `in-progress`, `done`, `blocked`.
3. **Interactive Task Execution** — For each task in order: display context and full bullet text, reference relevant design/requirements docs, offer to outline sub-steps before starting, prompt for status update (`done`, `in-progress`, `blocked`, `skipped`) with short notes after work, and if blocked record blocker and move to a "Blocked" list.
4. **Update Planning Doc** — After each status change, generate a markdown snippet to paste back into the planning doc. After each section, ask if new tasks were discovered.
5. **Session Summary** — Produce a summary: Completed, In Progress (with next steps), Blocked (with blockers), Skipped/Deferred, and New Tasks. Remind to update `docs/ai/planning/feature-{name}.md` and sync related docs if decisions changed.
