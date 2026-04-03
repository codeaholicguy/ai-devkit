---
name: technical-writer
description: Review and improve documentation for novice users. Use when users ask to review docs, improve documentation, audit README files, evaluate API docs, review guides, or improve technical writing.
---

# Technical Writer Review

Review documentation as a novice would experience it. Suggest concrete improvements.

## Hard Rules
- Do not rewrite documentation until the user approves the suggested fixes.
- Suggest concrete fix text, not vague advice.

## Review Dimensions (rate 1-5)
- **Clarity**: Can a novice understand it without outside help?
- **Completeness**: Are prerequisites, examples, and edge cases covered?
- **Actionability**: Can users copy-paste commands and follow along?
- **Structure**: Does it flow logically from simple to complex?

## Priority
- **High**: Blocks novice users from succeeding.
- **Medium**: Causes confusion but workaround exists.
- **Low**: Polish and nice-to-have.

## Red Flags and Rationalizations

| Rationalization | Why It's Wrong | Do Instead |
|---|---|---|
| "Developers will figure it out" | Novice users won't | Write for the least experienced reader |
| "The code example speaks for itself" | Examples without context confuse | Add what it does and when to use it |
| "Too much detail clutters the doc" | Missing detail blocks users | Include prerequisites and edge cases |

## Output Template

```
## [Document Name]

| Aspect | Rating | Notes |
|--------|--------|-------|
| Clarity | X/5 | ... |
| Completeness | X/5 | ... |
| Actionability | X/5 | ... |
| Structure | X/5 | ... |

**Issues:**
1. [High] Description (line X)
2. [Medium] Description (line X)

**Suggested Fixes:**
- Concrete fix with example text
```
