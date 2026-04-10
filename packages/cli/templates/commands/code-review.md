---
description: Pre-push code review against design docs.
---

Perform a **holistic** local code review **before** pushing changes. Go beyond the diff — review how changes integrate with the broader codebase.

1. **Gather Context** — If not already provided, ask for: feature/branch description, relevant design doc(s) (e.g., `{{docsDir}}/design/feature-{name}.md`), known constraints or risky areas, and which tests have been run. Run `git status` and `git diff --stat` to identify modified files.
2. **Use Memory for Context** — Search memory for project review standards and recurring pitfalls: `npx ai-devkit@latest memory search --query "code review checklist project conventions"`.
3. **Understand Design Alignment** — For each design doc, summarize architectural intent and critical constraints.
4. **Holistic Codebase Review** — For each modified file, use targeted grep/glob on exported names (functions, types, constants) to trace callers and dependents. Read only relevant sections (signatures, call sites, type defs) — skip files with no shared interface. Then check:
   - **Consistency**: Scan 1–2 similar modules to verify the change follows established patterns.
   - **Duplication**: Search for existing utilities the new code could reuse or now duplicates.
   - **Contract integrity**: Verify type signatures, API contracts, and config/DB schemas remain consistent at integration boundaries.
   - **Dependency health**: Check for circular dependencies or version conflicts from new/changed imports.
   - **Breaking changes**: Are public APIs, CLI flags, env vars, or config keys changed in ways that break existing consumers? Check downstream dependents.
   - **Rollback safety**: Can this change be safely reverted? Flag irreversible migrations, one-way data format changes, or state transitions that cannot be undone.
5. **File-by-File Review** — For every modified file: check alignment with design/requirements and flag deviations, spot logic issues/edge cases/redundant code, flag security concerns (input validation, secrets, auth, data handling), check error handling/performance/observability, and identify missing or outdated tests.
6. **Cross-Cutting Concerns** — Verify naming consistency and project conventions. Confirm docs/comments updated where behavior changed. Identify missing tests (unit, integration, E2E). Check for needed configuration/migration updates.
7. **Store Reusable Knowledge** — Save durable review findings/checklists with `npx ai-devkit@latest memory store ...`.
8. **Summarize Findings** — Categorize each finding as **blocking**, **important**, or **nice-to-have** with: file, issue, impact, recommendation, and design reference. Include findings from both the diff and the broader codebase analysis.
9. **Next Command Guidance** — If blocking issues remain, return to `/execute-plan` (code fixes) or `/writing-test` (test gaps); if clean, proceed with push/PR workflow.
