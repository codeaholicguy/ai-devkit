---
description: Review feature requirements for completeness.
---

Review `docs/ai/requirements/feature-{name}.md` and the project-level template `docs/ai/requirements/README.md` to ensure structure and content alignment.

1. **Use Memory for Context** — Search memory for related requirements/domain decisions before starting: `npx ai-devkit@latest memory search --query "<feature requirements>"`.
2. Summarize:
   - Core problem statement and affected users
   - Goals, non-goals, and success criteria
   - Primary user stories & critical flows
   - Constraints, assumptions, open questions
   - Any missing sections or deviations from the template
3. Identify gaps or contradictions and suggest clarifications.
4. **Store Reusable Knowledge** — If new reusable requirement conventions are agreed, store them with `npx ai-devkit@latest memory store ...`.
5. **Next Command Guidance** — If fundamentals are missing, go back to `/new-requirement`; otherwise continue to `/review-design`.
