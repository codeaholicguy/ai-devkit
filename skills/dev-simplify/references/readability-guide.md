# Readability Guide

**Good code reads like a good book — naturally, from left to right, top to bottom.**

## DO
- **Linear flow**: Read top-to-bottom without jumping around.
- **Explicit over implicit**: Clear code over clever shortcuts.
- **Meaningful names**: Purpose obvious without comments.
- **Consistent patterns**: Same patterns throughout the codebase.
- **Single abstraction level**: One level of abstraction per function.
- **Logical grouping**: Blank lines to separate logical blocks.

## AVOID: Over-Optimization for Brevity

These patterns harm readability — prefer the alternative:
- **Nested ternaries** (`a ? b ? c : d : e`) → explicit if/else.
- **Chained one-liners** (`.map().filter().reduce().flat()`) → named intermediate steps.
- **Clever bitwise tricks** (`n & 1` for odd check) → readable arithmetic.
- **Short variable names** (`x`, `y`, `z`) → descriptive names (`users`, `activeUsers`).
- **Implicit returns everywhere** → explicit returns for complex logic.
- **Magic one-liners** (regex/reduce that "do everything") → documented steps.
- **Premature DRY** (abstraction to avoid 2-3 lines of duplication) → some duplication is clearer.

## The "Reading Test"

For each simplification, all four must be "yes":
1. Can a new team member understand this in under 30 seconds?
2. Does the code flow naturally without jumping to other files?
3. Are there any "wait, what does this do?" moments?
4. Would this code still be clear 6 months from now?
