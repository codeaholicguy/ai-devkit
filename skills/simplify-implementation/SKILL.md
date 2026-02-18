---
name: simplify-implementation
description: Analyze and simplify existing implementations to reduce complexity, improve maintainability, and enhance scalability. Use when users ask to simplify code, reduce complexity, refactor for readability, clean up implementations, improve maintainability, reduce technical debt, or make code easier to understand.
---

# Simplify Implementation Assistant

Reduce complexity with an analysis-first approach before changing code.

## Hard Rules
- Do not modify code until the user approves a simplification plan.
- Readability over brevity. Some duplication beats the wrong abstraction.

## Workflow

1. Gather Context
- Confirm targets, pain points, and constraints (compatibility, API stability, deadlines).

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

## Validation
- Verify no regressions, add tests for new helpers, update docs if interfaces changed.

## Output Template
- Target and Context
- Complexity Analysis
- Simplification Proposals (prioritized)
- Recommended Order and Plan
- Scalability Recommendations
- Validation Checklist
