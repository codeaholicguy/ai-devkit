---
name: verify
description: Enforce evidence-based completion claims — require fresh command output before reporting success. Use when completing any task, fixing a bug, finishing a phase, running tests, building, deploying, or making any "it works" claim.
---

# Verify

Prove it works before saying it works.

## Hard Rules

- Do not claim completion without fresh terminal evidence from this session.
- Forbidden words in completion claims: "should", "probably", "seems to", "likely", "I believe", "I think it works". These signal unverified assertions.
- Cached, remembered, or previous-session output is not evidence. Run it again.

## Gate Function

Every completion claim must pass all 5 steps in order:

1. **Identify** — What command proves this claim? If multiple commands are needed, run the gate once per command.
2. **Run** — Execute the full command now. No partial runs, no skipping.
3. **Read** — Read complete output. Check exit code. Count pass/fail.
4. **Confirm** — Does the output prove the exact claim?
5. **Report** — State the result, cite command, exit code, and key output.

If any step fails, stop. Fix the issue and restart from step 1.

If no verification command exists (e.g., no test suite), tell the user and ask them how to verify before claiming done.

## Verification Patterns

| Claim | Required Evidence | Not Sufficient |
|---|---|---|
| Tests pass | Test output: 0 failures, exit 0 | Previous run, "should pass now" |
| Build succeeds | Build output: exit 0 | Linter passing, partial build |
| Bug is fixed | Reproduce symptom → now passes | "Changed code, should be fixed" |
| Linter clean | Linter output: 0 errors | Single file check |
| Phase complete | Each criterion verified individually | "Tests pass, so done" |
| Feature works | E2E test or manual walkthrough | Unit tests alone |

## Regression Verification

For bug fixes, a single pass is not enough:

1. Write a test covering the bug.
2. Run → **must pass** (fix in place).
3. Revert the fix.
4. Run → **must fail** (proves test catches the bug).
5. Restore the fix.
6. Run → **must pass**.

If step 4 passes, the test is wrong. Rewrite it.

## Red Flags and Rationalizations

| Rationalization | Why It's Wrong | Do Instead |
|---|---|---|
| "This change is trivial" | Trivial changes break things constantly | Run the check |
| "I ran it earlier" | Code changed since then | Run it again now |
| "The test is flaky" | Flaky ≠ ignorable | Fix the flake first |
| "It compiles, so it works" | Compilation ≠ correctness | Run the tests |
| "The CI will catch it" | CI is a safety net, not a substitute | Verify locally first |
| "The agent said it's done" | Agent claims need verification too | Check diff and run tests |

## Memory Integration

After a failed verification, store the failure pattern: `npx ai-devkit@latest memory store --title "<failure pattern>" --content "<what failed and how to avoid>" --tags "verify,failure-pattern"`
