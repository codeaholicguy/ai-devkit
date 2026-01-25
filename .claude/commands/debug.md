---
description: Guide me through debugging a code issue by clarifying expectations, identifying gaps, and agreeing on a fix plan before changing code.
---

# Local Debugging Assistant

Help me debug an issue by clarifying expectations, identifying gaps, and agreeing on a fix plan before changing code.

## Step 1: Gather Context
Ask me for:
- Brief issue description (what is happening?)
- Expected behavior or acceptance criteria (what should happen?)
- Current behavior and any error messages/logs
- Recent related changes or deployments
- Scope of impact (users, services, environments)

## Step 2: Clarify Reality vs Expectation
- Restate the observed behavior vs the expected outcome
- Confirm relevant requirements, tickets, or docs that define the expectation
- Identify acceptance criteria for the fix (how we know it is resolved)

## Step 3: Reproduce & Isolate
- Determine reproducibility (always, intermittent, environment-specific)
- Capture reproduction steps or commands
- Note any available tests that expose the failure
- List suspected components, services, or modules

## Step 4: Analyze Potential Causes
- Brainstorm plausible root causes (data, config, code regressions, external dependencies)
- Gather supporting evidence (logs, metrics, traces, screenshots)
- Highlight gaps or unknowns that need investigation

## Step 5: Surface Options
- Present possible resolution paths (quick fix, deeper refactor, rollback, feature flag, etc.)
- For each option, list pros/cons, risks, and verification steps
- Consider required approvals or coordination

## Step 6: Confirm Path Forward
- Ask which option we should pursue
- Summarize chosen approach, required pre-work, and success criteria
- Plan validation steps (tests, monitoring, user sign-off)

## Step 7: Next Actions & Tracking
- Document tasks, owners, and timelines for the selected option
- Note follow-up actions after deployment (monitoring, comms, postmortem if needed)
- Encourage updating relevant docs/tests once resolved

Let me know when you're ready to walk through the debugging flow.

