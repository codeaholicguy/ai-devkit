---
name: dev-lifecycle
description: Full software development lifecycle workflow covering requirements, design, planning, implementation, testing, and code review. Use this skill when a user wants to build a new feature end-to-end, clarify or document requirements, review requirements or design docs, execute a feature plan, check implementation against design, perform code review, or write tests. Triggers on requests like "new feature", "add requirement", "review requirements", "review design", "execute plan", "check implementation", "code review", "write tests", or any structured SDLC workflow.
---

# Dev Lifecycle

Structured development lifecycle from requirements through testing. Each phase produces documentation in `docs/ai/` and feeds into the next.

## Phases

| # | Phase | Reference | Trigger |
|---|-------|-----------|---------|
| 1 | **New Requirement** | [references/new-requirement.md](references/new-requirement.md) | User wants to add a feature or define a requirement |
| 2 | **Review Requirements** | [references/review-requirements.md](references/review-requirements.md) | Requirements doc exists and needs validation |
| 3 | **Review Design** | [references/review-design.md](references/review-design.md) | Design doc exists and needs validation |
| 4 | **Execute Plan** | [references/execute-plan.md](references/execute-plan.md) | Planning doc exists and user is ready to implement |
| 5 | **Check Implementation** | [references/check-implementation.md](references/check-implementation.md) | Code changes exist and need validation against design |
| 6 | **Code Review** | [references/code-review.md](references/code-review.md) | Changes are ready for pre-push review |
| 7 | **Write Tests** | [references/writing-test.md](references/writing-test.md) | Feature needs unit/integration/E2E tests |

## Phase Selection

1. If the user has no docs yet and wants to build something new → start at **Phase 1**.
2. If requirements doc exists but hasn't been reviewed → **Phase 2**.
3. If design doc exists but hasn't been reviewed → **Phase 3**.
4. If planning doc exists and user says "implement" or "execute" → **Phase 4**.
5. If code is written and user wants to verify against design → **Phase 5**.
6. If code is ready to push → **Phase 6**.
7. If user asks for tests at any point → **Phase 7**.

When starting a new feature end-to-end, walk through phases 1→2→3→4→5→7→6 sequentially. Load only the reference file for the current phase.

## Documentation Structure

All phase docs live under `docs/ai/`:

```
docs/ai/
├── requirements/feature-{name}.md
├── design/feature-{name}.md
├── planning/feature-{name}.md
├── implementation/feature-{name}.md
└── testing/feature-{name}.md
```

Each feature doc is created by copying the corresponding `README.md` template in that directory, preserving frontmatter and section headings.

## Operating Rules

- Read the relevant phase reference file before guiding the user through that phase.
- Always read existing docs in `docs/ai/` before making changes.
- Keep diffs minimal; avoid unrelated edits.
- Use mermaid diagrams for architecture and data-flow visuals.
- After each phase, summarize what was produced and suggest the next phase.
- If blocked, surface the issue and suggest alternatives before escalating.

## Supplementary Workflows

These can be invoked at any point during the lifecycle:

- **Debug**: Structured debugging with root cause analysis before code changes.
- **Update Planning**: Reconcile planning docs with current implementation progress.
- **Simplify Implementation**: Analyze and reduce complexity in existing code.
- **Capture Knowledge**: Document understanding of a code entry point.
- **Remember**: Store reusable guidance in the knowledge memory service.
