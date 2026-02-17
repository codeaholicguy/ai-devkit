# Phase 8: Code Review

Final pre-push review. Check `git status -sb` and `git diff --stat`.

1. **Gather context** — feature description, modified files, design docs, risky areas, tests already run.
2. **Verify design alignment** — summarize architectural intent, check implementation matches.
3. **File-by-file review** — correctness, logic/edge cases, redundancy, security, performance, error handling, test coverage.
4. **Cross-cutting** — naming conventions, documentation updates, missing tests, config/migration changes.
5. **Summarize** — blocking issues, important follow-ups, nice-to-haves. Per finding: file, issue, impact severity, recommendation.
6. **Final checklist** — design match, no logic gaps, security addressed, tests cover changes, docs updated.

**Done**: If checklist passes, ready to push and create PR. If blocking issues → back to Phase 4 (fix code) or Phase 7 (add tests).
