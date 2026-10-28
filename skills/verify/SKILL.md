---
name: verify
description: AI DevKit · Enforce evidence-based completion claims — require fresh command output before reporting success. Use when completing any task, fixing a bug, finishing a phase, running tests, building, deploying, or making any "it works" claim.
---

# Verify

Prove it works before saying it works.

## Hard Rules

- Do not claim completion without fresh terminal evidence from this session.
- Forbidden words in completion claims: "should", "probably", "seems to", "likely", "I believe", "I think it works". These signal unverified assertions.
- Cached, remembered, or previous-session output is not evidence. Run it again.
- A change that alters anything a user or caller sees requires a `dev-smoke` run, whatever the claim is called.

## Gate Function

Every completion claim must pass all steps in order:

0. **Classify** — Does the change alter anything a user or caller sees (CLI output, API response, UI, displayed status or state, file formats)? If yes, `dev-smoke` is required evidence alongside tests.
1. **Identify** — What command proves this claim? If multiple commands are needed, run the gate once per command.
2. **Run** — Execute the full command now. No partial runs, no skipping.
3. **Read** — Read complete output. Check exit code. Count pass/fail.
4. **Confirm** — Does the output prove the exact claim?
5. **Report** — State the result in the Report Format below.

If any step fails, stop. Fix the issue and restart from step 0.

If no verification command exists (e.g., no test suite), tell the user and ask them how to verify before claiming done.

## Verification Patterns

| Claim | Required Evidence | Not Sufficient |
|---|---|---|
| Tests pass | Test output: 0 failures, exit 0 | Previous run, "should pass now" |
| Build succeeds | Build output: exit 0 | Linter passing, partial build |
| Bug is fixed | Symptom reproduced at the level the user saw it (CLI/API/UI) → now gone, plus a regression test | "Changed code, should be fixed"; unit test alone for a user-visible bug |
| Linter clean | Linter output: 0 errors | Single file check |
| Phase complete | Each criterion verified individually | "Tests pass, so done" |
| Feature works | `dev-smoke` run or E2E test | Unit tests alone |

## Report Format

List every evidence type, so a skipped check is visible:

- Tests: `<command>` → exit `<n>`, `<pass>`/`<fail>`
- Lint/format: `<command>` → exit `<n>`
- Regression check: test fails without the fix? yes/no/not a bug fix
- Smoke: ran (`<flow>`, result) | not applicable (`<why the change is not user-facing>`) | skipped (user asked)

## Regression Verification

For bug fixes, a single pass is not enough:

1. Write a test covering the bug.
2. Run → **must pass** (fix in place).
3. Revert the fix.
4. Run → **must fail** (proves test catches the bug).
5. Restore the fix.
6. Run → **must pass**.

If step 4 passes, the test is wrong. Rewrite it.

Revert with a patch, never `git stash` — `git stash pop` restores whatever stash is on top, which may not be yours:

```bash
git diff -- <fix paths> > "$SCRATCH/fix.patch" && git apply -R "$SCRATCH/fix.patch"
# run tests (must fail)
git apply "$SCRATCH/fix.patch"
```

## Red Flags and Rationalizations

| Rationalization | Why It's Wrong | Do Instead |
|---|---|---|
| "This change is trivial" | Trivial changes break things constantly | Run the check |
| "I ran it earlier" | Code changed since then | Run it again now |
| "The test is flaky" | Flaky ≠ ignorable | Fix the flake first |
| "It compiles, so it works" | Compilation ≠ correctness | Run the tests |
| "The CI will catch it" | CI is a safety net, not a substitute | Verify locally first |
| "The agent said it's done" | Agent claims need verification too | Check diff and run tests |
| "Unit tests and fixtures cover it" | They test logic on mocked inputs, not the flow a user runs | Run `dev-smoke`, or state why the change is not user-facing |
| "I'll call it 'tests pass', not 'feature works'" | Narrow wording doesn't change what was changed | Classify the change (step 0) first |

## Memory Integration

After a failed verification, store the failure pattern: `npx ai-devkit@latest memory store --title "<failure pattern>" --content "<what failed and how to avoid>" --tags "verify,failure-pattern"`

## Task Tracing

If a task name is known and tracing is usable, record `task evidence` after
the verification report per `task`. If tracing was not probed, run the real read
probe first. If probe or evidence recording fails, report the failed task command
and continue verification; never block verification on optional task logging.
