---
description: Pre-push code review against design docs.
---

Perform a local code review **before** pushing changes.

1. **Gather Context** — If not already provided, ask for: feature/branch description, list of modified files, relevant design doc(s) (e.g., `docs/ai/design/feature-{name}.md`), known constraints or risky areas, and which tests have been run. Also review the latest diff via `git status` and `git diff --stat`.
2. **Understand Design Alignment** — For each design doc, summarize architectural intent and critical constraints.
3. **File-by-File Review** — For every modified file: check alignment with design/requirements and flag deviations, spot logic issues/edge cases/redundant code, flag security concerns (input validation, secrets, auth, data handling), check error handling/performance/observability, and identify missing or outdated tests.
4. **Cross-Cutting Concerns** — Verify naming consistency and project conventions. Confirm docs/comments updated where behavior changed. Identify missing tests (unit, integration, E2E). Check for needed configuration/migration updates.
5. **Summarize Findings** — Categorize each finding as **blocking**, **important**, or **nice-to-have** with: file, issue, impact, recommendation, and design reference.
