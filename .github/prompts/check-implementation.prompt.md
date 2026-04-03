---
description: Compare implementation with design and requirements docs to ensure alignment.
---

Compare the current implementation with the design in `docs/ai/design/` and requirements in `docs/ai/requirements/`.

1. If not already provided, ask for: feature/branch description, list of modified files, relevant design doc(s), and any known constraints or assumptions.
2. **Use Memory for Context** — Search memory for known constraints and prior decisions before assessing mismatches: `npx ai-devkit@latest memory search --query "<feature implementation alignment>"`.
3. For each design doc: summarize key architectural decisions and constraints, highlight components, interfaces, and data flows that must be respected.
4. File-by-file comparison: confirm implementation matches design intent, note deviations or missing pieces, flag logic gaps, edge cases, or security issues, suggest simplifications or refactors, and identify missing tests or documentation updates.
5. **Store Reusable Knowledge** — Save recurring alignment lessons/patterns with `npx ai-devkit@latest memory store ...`.
6. Summarize findings with recommended next steps.
7. **Next Command Guidance** — If major design issues are found, go back to `/review-design` or `/execute-plan`; if aligned, continue to `/writing-test`.
