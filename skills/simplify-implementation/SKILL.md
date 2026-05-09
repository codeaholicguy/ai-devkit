---
name: simplify-implementation
description: AI DevKit · Analyze and simplify existing implementations to reduce complexity, improve maintainability, and enhance scalability. Use when users ask to simplify code, reduce complexity, refactor for readability, clean up implementations, improve maintainability, reduce technical debt, or make code easier to understand.
---

# Simplify Implementation Assistant

Reduce complexity with an analysis-first approach before changing code.

## Hard Rules
- Do not modify code until the user approves a simplification plan.
- Readability over brevity. Some duplication beats the wrong abstraction.
- Prefer reusing an existing function over introducing a new one — but only if it fits cleanly. Do not force-fit a near-match.
- For breaking changes: modify in place only when all callers are in-repo and updated in the same change. For public/external APIs, add a new function and deprecate the old one (parallel change).

## Workflow

1. Gather Context
- Confirm targets, pain points, and constraints (compatibility, API stability, deadlines).
- Search for past simplification decisions or known constraints: `npx ai-devkit@latest memory search --query "<target area>" --tags "simplify"`

2. Analyze Complexity
- Identify sources (nesting, duplication, coupling, over-engineering, magic values).
- Assess impact (LOC, dependencies, cognitive load, scalability blockers).

3. Apply Readability Principles
- Apply the [readability guide](references/readability-guide.md) and its "Reading Test".

4. Propose Simplifications
For each issue, apply a pattern:
- **Extract**: Long functions → smaller, focused functions.
- **Consolidate**: Duplicate code → shared utilities.
- **Flatten**: Deep nesting → early returns, guard clauses.
- **Decouple**: Tight coupling → dependency injection, interfaces.
- **Remove**: Dead code, unused features, excessive abstractions.
- **Replace**: Complex logic → built-in language/library features.
- **Defer**: Premature optimization → measure-first approach.

5. Prioritize and Plan
- Rank by impact/risk. Present plan with before/after snippets. Request approval.

## Red Flags and Rationalizations

| Rationalization | Why It's Wrong | Do Instead |
|---|---|---|
| "While I'm here, let me refactor this too" | Scope creep breaks things | Only simplify what was requested |
| "This abstraction will help later" | Predicted reuse rarely materializes | Remove it unless used twice today |
| "Shorter is simpler" | Brevity can hide complexity | Optimize for readability, not line count |
| "I'll add a v2 instead of updating callers" | Accumulates dead code and forks the API | Modify in place when callers are in-repo; parallel-change only for external/public APIs |
| "Existing fn is close enough — I'll bend it to fit" | Wrong abstraction is costlier than duplication | Reuse only on clean fit; otherwise keep the small duplicate |

## Validation
- Verify no regressions, add tests for new helpers, update docs if interfaces changed.

## Output Template
- Target and Context
- Complexity Analysis
- Simplification Proposals (prioritized)
- Recommended Order and Plan
- Scalability Recommendations
- Validation Checklist
