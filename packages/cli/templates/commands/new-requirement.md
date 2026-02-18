---
description: Scaffold feature documentation from requirements through planning.
---

Guide me through adding a new feature, from requirements documentation to implementation readiness.

1. **Capture Requirement** — If not already provided, ask for: feature name (kebab-case, e.g., `user-authentication`), what problem it solves and who will use it, and key user stories.
2. **Create Feature Documentation Structure** — Copy each template's content (preserving YAML frontmatter and section headings) into feature-specific files:
   - `docs/ai/requirements/README.md` → `docs/ai/requirements/feature-{name}.md`
   - `docs/ai/design/README.md` → `docs/ai/design/feature-{name}.md`
   - `docs/ai/planning/README.md` → `docs/ai/planning/feature-{name}.md`
   - `docs/ai/implementation/README.md` → `docs/ai/implementation/feature-{name}.md`
   - `docs/ai/testing/README.md` → `docs/ai/testing/feature-{name}.md`
3. **Requirements Phase** — Fill out `docs/ai/requirements/feature-{name}.md`: problem statement, goals/non-goals, user stories, success criteria, constraints, open questions.
4. **Design Phase** — Fill out `docs/ai/design/feature-{name}.md`: architecture changes, data models, API/interfaces, components, design decisions, security and performance considerations.
5. **Planning Phase** — Fill out `docs/ai/planning/feature-{name}.md`: task breakdown with subtasks, dependencies, effort estimates, implementation order, risks.
6. **Documentation Review** — Run `/review-requirements` and `/review-design` to validate the drafted docs.
7. **Next Steps** — This command focuses on documentation. When ready to implement, use `/execute-plan`. Generate a PR description covering: summary, requirements doc link, key changes, test status, and a readiness checklist.
