---
description: Scaffold feature documentation from requirements through planning.
---

Guide me through adding a new feature, from requirements documentation to implementation readiness.

1. **Use AI DevKit Memory for Context** — Search AI DevKit memory (not built-in memory) for related decisions or conventions via `npx ai-devkit@latest memory search --query "<feature/topic>"` and reuse relevant context. If unfamiliar, check the AI DevKit memory skill first.
2. **Capture Requirement** — Ask for: feature name (kebab-case, e.g., `user-authentication`), problem it solves, who uses it, key user stories. **Brainstorm**: ask clarifying questions as needed, explore alternatives to confirm this is the right thing to build, then present 2–3 approaches with one-line trade-offs and a recommendation.
3. **Create Feature Documentation Structure** — Copy each template's content (preserving YAML frontmatter and section headings) into feature-specific files:
   - `{{docsDir}}/requirements/README.md` → `{{docsDir}}/requirements/feature-{name}.md`
   - `{{docsDir}}/design/README.md` → `{{docsDir}}/design/feature-{name}.md`
   - `{{docsDir}}/planning/README.md` → `{{docsDir}}/planning/feature-{name}.md`
   - `{{docsDir}}/implementation/README.md` → `{{docsDir}}/implementation/feature-{name}.md`
   - `{{docsDir}}/testing/README.md` → `{{docsDir}}/testing/feature-{name}.md`
4. **Requirements Phase** — Fill out `{{docsDir}}/requirements/feature-{name}.md`: problem statement, goals/non-goals, user stories, success criteria, constraints, open questions.
5. **Design Phase** — Fill out `{{docsDir}}/design/feature-{name}.md`: architecture changes, data models, API/interfaces, components, design decisions, security and performance considerations.
6. **Planning Phase** — Fill out `{{docsDir}}/planning/feature-{name}.md`: task breakdown with subtasks, dependencies, effort estimates, implementation order, risks.
7. **Store Reusable Knowledge** — When important conventions or decisions are finalized, store them via `npx ai-devkit@latest memory store --title "<title>" --content "<knowledge>" --tags "<tags>"`.
8. **Next Command Guidance** — Run `/review-requirements` first, then `/review-design`. If both pass, continue with `/execute-plan`.
