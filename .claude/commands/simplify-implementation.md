---
description: Simplify existing code to reduce complexity.
---

Help me simplify an existing implementation while maintaining or improving its functionality.

1. **Gather Context** — If not already provided, ask for: target file(s) or component(s) to simplify, current pain points (hard to understand, maintain, or extend?), performance or scalability concerns, constraints (backward compatibility, API stability, deadlines), and relevant design docs or requirements.
2. **Use Memory for Context** — Search memory for established patterns and prior refactors in this area: `npx ai-devkit@latest memory search --query "<component simplification pattern>"`.
3. **Analyze Current Complexity** — For each target: identify complexity sources (deep nesting, duplication, unclear abstractions, tight coupling, over-engineering, magic values), assess cognitive load for future maintainers, and identify scalability blockers (single points of failure, sync-where-async-needed, missing caching, inefficient algorithms).
4. **Propose Simplifications** — Prioritize readability over brevity; apply the 30-second test: can a new team member understand each change quickly? For each issue, suggest concrete improvements (extract, consolidate, flatten, decouple, remove dead code, replace with built-ins). Provide before/after snippets.
5. **Prioritize & Plan** — Rank by impact vs risk: (1) high impact, low risk — do first, (2) high impact, higher risk — plan carefully, (3) low impact, low risk — quick wins if time permits, (4) low impact, high risk — skip or defer. For each change specify risk level, testing requirements, and effort. Produce a prioritized action plan with recommended execution order.
6. **Store Reusable Knowledge** — Save reusable simplification patterns and trade-offs via `npx ai-devkit@latest memory store ...`.
7. **Next Command Guidance** — After implementation, run `/check-implementation` and `/writing-test`.
