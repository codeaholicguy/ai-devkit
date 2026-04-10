# Phase 8: Code Review

Final pre-push **holistic** review. Go beyond the diff — review how changes integrate with the broader codebase. Check `git status -sb` and `git diff --stat`.

1. **Gather context** — feature description, modified files, design docs, risky areas, tests already run.
2. **Verify design alignment** — summarize architectural intent, check implementation matches.
3. **Holistic codebase review** — for each modified file, grep exported names (functions, types, constants) to trace callers and dependents. Read only relevant sections (signatures, call sites, type defs) — skip files with no shared interface. Then check:
   - **Consistency**: scan 1–2 similar modules for pattern alignment.
   - **Duplication**: search for existing utilities the new code could reuse or now duplicates.
   - **Contract integrity**: verify type signatures, API contracts, config/DB schemas remain consistent at integration boundaries.
   - **Dependency health**: check for circular dependencies or version conflicts from new imports.
   - **Breaking changes**: public APIs, CLI flags, env vars, or config keys changed in ways that break existing consumers.
   - **Rollback safety**: can this be safely reverted? Flag irreversible migrations or one-way data/state changes.
4. **File-by-file review** — correctness, logic/edge cases, redundancy, security, performance, error handling, test coverage.
5. **Cross-cutting** — naming conventions, documentation updates, missing tests, config/migration changes.
6. **Summarize** — blocking issues, important follow-ups, nice-to-haves. Per finding: file, issue, impact severity, recommendation. Include findings from both diff and broader codebase analysis.
7. **Final checklist** — design match, no logic gaps, security addressed, integration points verified, tests cover changes, docs updated.

**Done**: If checklist passes, ready to push and create PR. If blocking issues → back to Phase 4 (fix code) or Phase 7 (add tests).
