# Phase 4: Execute Plan

Work through the latest matching `docs/ai/planning/YYYY-MM-DD-feature-{name}.md`. If none exists, use `docs/ai/planning/feature-{name}.md`. Execute one task at a time.

1. **Gather context** — feature name, planning doc path, supporting docs (design, requirements), current branch/diff.
2. **Load plan** — parse task lists (checkboxes), build ordered queue by section.
3. **Present task queue** with status: `todo`, `in-progress`, `done`, `blocked`.
4. **For each task**: show context, suggest relevant docs, offer to outline sub-steps from design doc. Apply the `tdd` skill — write a failing test before production code, then make it pass. If blocked, record blocker and defer.
   - **Reuse before writing** — grep for existing utilities/functions before adding new ones. Reuse only if it fits cleanly; don't force-fit a near-match (a small duplicate beats a wrong abstraction).
   - **Breaking changes** — if all callers live in this repo and can be updated atomically, modify in place and update callers in the same change. If callers are external, public, or cross-service, add a new function and deprecate the old one (parallel change) rather than mutating the existing signature.
5. **Inline tracking** — generate markdown snippet after each status change (lightweight; full reconciliation in Phase 5).
6. **Update docs after each task** — (a) testing doc: mark scenarios done with file paths, add scenarios discovered while coding, drop invalid ones; (b) implementation doc: record files changed (paths), decisions made, deviations from design, edge cases handled. Both docs stay in lockstep with code — do not defer to Phase 6 or 7.
7. **After each section**, ask if new tasks were discovered.
8. **Session summary** — completed, in-progress, blocked, skipped, new tasks, doc deltas.

**Next**: After completing any task → Phase 5 (Update Planning). When all done → Phase 6 → 7 → 8.
