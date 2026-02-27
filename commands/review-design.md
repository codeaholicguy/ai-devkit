---
description: Review feature design for completeness.
---

Review the design documentation in `docs/ai/design/feature-{name}.md` (and the project-level README if relevant).

1. **Use Memory for Context** — Search memory for prior architecture constraints/patterns: `npx ai-devkit@latest memory search --query "<feature design architecture>"`.
2. Summarize:
   - Architecture overview (ensure mermaid diagram is present and accurate)
   - Key components and their responsibilities
   - Technology choices and rationale
   - Data models and relationships
   - API/interface contracts (inputs, outputs, auth)
   - Major design decisions and trade-offs
   - Non-functional requirements that must be preserved
3. Highlight inconsistencies, missing sections, or diagrams that need updates.
4. **Store Reusable Knowledge** — Persist approved design patterns/constraints with `npx ai-devkit@latest memory store ...` when they will help future work.
5. **Next Command Guidance** — If requirements gaps are found, return to `/review-requirements`; if design is sound, continue to `/execute-plan`.
