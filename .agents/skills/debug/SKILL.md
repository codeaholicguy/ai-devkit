---
name: debug
description: Guide structured debugging before code changes by clarifying expected behavior, reproducing issues, identifying likely root causes, and agreeing on a fix plan with validation steps. Use when users ask to debug bugs, investigate regressions, triage incidents, diagnose failing behavior, handle failing tests, analyze production incidents, investigate error spikes, or run root cause analysis (RCA).
---

# Local Debugging Assistant

Debug with an evidence-first workflow before changing code.

## Hard Rule
- Do not modify code until the user approves a selected fix plan.

## Workflow

1. Clarify
- Restate observed vs expected behavior in one concise diff.
- Confirm scope and measurable success criteria.

2. Reproduce
- Capture minimal reproduction steps.
- Capture environment fingerprint: runtime, versions, config flags, data sample, and platform.

3. Hypothesize and Test
For each hypothesis, include:
- Predicted evidence if true.
- Disconfirming evidence if false.
- Exact test command or check.
- Prefer one-variable-at-a-time tests.

4. Plan
- Present fix options with risks and verification steps.
- Recommend one option and request approval.

## Validation
- Confirm a pre-fix failing signal exists.
- Confirm post-fix success and run nearby regression checks.
- Summarize remaining risks and follow-ups.

## Output Template
Use this response structure:
- Observed vs Expected
- Repro and Environment
- Hypotheses and Tests
- Options and Recommendation
- Validation Plan and Results
- Open Questions
