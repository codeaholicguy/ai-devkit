---
description: AI DevKit · Scaffold feature documentation from requirements through planning.
---

Guide me through adding a new feature, from requirements documentation to implementation readiness.

1. **Use AI DevKit Memory for Context** — Search AI DevKit memory (not built-in memory) for related decisions or conventions via `npx ai-devkit@latest memory search --query "<feature/topic>"` and reuse relevant context. If unfamiliar, check the AI DevKit memory skill first.
2. **Capture Requirement** — Ask for: feature name (kebab-case, e.g., `user-authentication`), problem it solves, who uses it, key user stories. **Brainstorm**: ask clarifying questions as needed, explore alternatives to confirm this is the right thing to build, then present 2–3 approaches with one-line trade-offs and a recommendation.
3. **Initialize Feature Documentation Structure** — Run `npx ai-devkit@latest docs init-feature {name}` and fill the returned paths. It uses configured phases. If unavailable, copy each configured phase `README.md` to `docs/ai/{phase}/feature-{name}.md`, preserving frontmatter and headings.
4. **Requirements Phase** — Fill out the generated or selected requirements doc: problem statement, goals/non-goals, user stories, success criteria, constraints, open questions.
5. **Design Phase** — Fill out the generated or selected design doc: architecture changes, data models, API/interfaces, components, design decisions, security and performance considerations.
6. **Planning Phase** — Fill out the generated or selected planning doc: task breakdown with subtasks, dependencies, effort estimates, implementation order, risks.
7. **Store Reusable Knowledge** — When important conventions or decisions are finalized, store them via `npx ai-devkit@latest memory store --title "<title>" --content "<knowledge>" --tags "<tags>"`.
8. **Next Command Guidance** — Run `/review-requirements` first, then `/review-design`. If both pass, continue with `/execute-plan`.
