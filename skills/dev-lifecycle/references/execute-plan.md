# Phase 4: Execute Plan

Work through `docs/ai/planning/feature-{name}.md` one task at a time.

1. **Gather context** — feature name, planning doc path, supporting docs (design, requirements), current branch/diff.
2. **Load plan** — parse task lists (checkboxes), build ordered queue by section.
3. **Present task queue** with status: `todo`, `in-progress`, `done`, `blocked`.
4. **For each task**: show context, suggest relevant docs, offer to outline sub-steps from design doc, execute, prompt for status + notes. If blocked, record blocker and defer.
5. **Inline tracking** — generate markdown snippet after each status change (lightweight; full reconciliation in Phase 5).
6. **After each section**, ask if new tasks were discovered.
7. **Session summary** — completed, in-progress, blocked, skipped, new tasks.

**Next**: After completing any task → Phase 5 (Update Planning). When all done → Phase 6 → 7 → 8.
