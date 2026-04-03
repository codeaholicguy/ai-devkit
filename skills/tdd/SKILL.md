---
name: tdd
description: Test-driven development — write a failing test before writing production code. Use when implementing new functionality, adding behavior, or fixing bugs during active development.
---

# TDD

Red. Green. Refactor. In that order, every time.

## Hard Rules

- No production code without a failing test first.
- If production code was written before its test, delete it and start over with a failing test.
- Never skip the red step. A test that has never failed proves nothing.

## Cycle

For each unit of behavior:

1. **Red** — Write a test for the next behavior. Run it. It must fail. Read the failure message — it should describe the missing behavior.
2. **Green** — Write the minimum production code to make the test pass. Nothing more. Run the test. Apply the `verify` skill.
3. **Refactor** — Clean up both test and production code. Run the test again. Still green? Done. Apply the `verify` skill.

Then pick the next behavior and repeat.

## Rules for Each Step

**Red:**
- Test one behavior, not one function. Name the test after what the system should do, not what the function is called.
- The test must fail for the right reason — a missing method, wrong return value, unmet condition. Not a syntax error or import failure.
- If the test passes immediately, it's not testing new behavior. Delete it or pick a different behavior.

**Green:**
- Write the simplest code that passes. Hardcode if needed — the next test will force generalization.
- Do not add code "while you're in there." If it's not required by a failing test, it doesn't exist yet.
- Do not refactor during green. Pass first, clean second.

**Refactor:**
- Remove duplication between test and production code.
- Extract only when you see real duplication, not predicted duplication.
- Tests must still pass after every refactor move. Run them after each change.

## Anti-Patterns

| Pattern | Problem | Fix |
|---|---|---|
| Test-after | Code shapes the test instead of the other way around | Delete the code, write the test first |
| Testing internals | Tests break on refactor, not on behavior change | Test public behavior only |
| Giant red step | Multiple behaviors in one test | One assertion per behavior |
| Gold-plating green | Adding code no test requires | Remove untested code |
| Skipping refactor | Tech debt accumulates immediately | Refactor before the next red |
| Mock-heavy tests | Tests pass but real code fails | Prefer real dependencies, mock at boundaries only |

## Red Flags and Rationalizations

| Rationalization | Why It's Wrong | Do Instead |
|---|---|---|
| "This is too simple to test first" | Simple code still needs a spec | Write the test — it'll be fast |
| "I'll add the test right after" | You won't, and the code will shape the test | Test first, always |
| "I need to see the design first" | The test IS the design | Let the test drive the interface |
| "Mocking is too hard for this" | Difficulty mocking signals tight coupling | Fix the design, then test |
| "The test would be identical to the implementation" | Then you're testing internals | Test the behavior from the outside |

## Memory Integration

After completing a TDD session, store reusable test patterns (setup, assertions, fixtures): `npx ai-devkit@latest memory store --title "<pattern>" --content "<details>" --tags "tdd,testing"`
