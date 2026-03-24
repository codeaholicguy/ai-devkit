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
3. **Clarify and explore (loop until converged)**:
   - **Ask clarification questions** for every gap, contradiction, or ambiguity. Do not just list issues — actively ask specific questions to resolve them.
   - **Brainstorm and explore options** — For key decisions, trade-offs, or areas with multiple viable approaches, proactively brainstorm alternatives. Present options with pros/cons and trade-offs. Challenge assumptions and surface creative alternatives.
   - **Repeat** — Continue looping until the user is satisfied with the chosen approach and no open questions remain.
4. **Store Reusable Knowledge** — If new reusable requirement conventions are agreed, store them with `npx ai-devkit@latest memory store ...`.
5. **Next Command Guidance** — If fundamentals are missing, go back to `/new-requirement`; otherwise continue to `/review-design`.
