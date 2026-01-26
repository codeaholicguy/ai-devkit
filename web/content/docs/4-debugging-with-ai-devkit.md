---
title: Debugging with AI DevKit
description: Learn how to systematically debug issues using AI DevKit's structured debugging workflows
order: 4
---

Debugging with AI assistants often becomes a guessing game—trying random fixes until something works. The `/debug` command changes this by providing a structured methodology that ensures you understand the problem before attempting a solution.

## When to Use `/debug`

Use this command when:
- Something isn't working as expected
- You're facing a bug you can't immediately explain
- You need to troubleshoot performance or integration issues
- You want a systematic approach instead of trial-and-error

## Quick Example

Here's what a `/debug` session looks like:

```
You: /debug

AI: What issue are you experiencing?

You: Users are getting a 500 error when trying to upload images larger than 5MB.

AI: Let me help you debug this systematically.

**Step 1: Gather Context**
- What's the expected behavior? (Users should upload images up to 10MB)
- When did this start? (After last deployment)
- Error logs? (Request entity too large)

**Step 2: Clarify Expectations**
Based on your requirements doc, the upload limit should be 10MB.
Current config shows: maxFileSize: '5mb'

**Step 3: Reproduce & Isolate**
I can reproduce with any file > 5MB. The issue is in the upload middleware.

**Step 4-7: Analysis → Solution**
Root cause: Config mismatch between frontend (10MB) and backend (5MB).
Recommended fix: Update backend config to match requirements.
```

## The 7-Step Debugging Process

The `/debug` command follows a proven methodology:

| Step | Purpose |
|------|---------|
| **1. Gather Context** | Understand what's happening vs. what should happen |
| **2. Clarify Expectations** | Confirm requirements and success criteria |
| **3. Reproduce & Isolate** | Create reliable reproduction steps |
| **4. Analyze Causes** | Identify potential root causes with evidence |
| **5. Surface Options** | Present multiple resolution approaches |
| **6. Confirm Path** | Select the best approach and plan validation |
| **7. Track Actions** | Document tasks, owners, and follow-ups |

### Step Details

**1. Gather Context**
- Understand what's happening vs. what should happen
- Identify the scope and impact of the issue
- Collect error messages, logs, and symptoms

**2. Clarify Expectations**
- Confirm requirements and acceptance criteria
- Define success metrics for the fix
- Identify relevant documentation or tickets

**3. Reproduce & Isolate**
- Create reliable reproduction steps
- Isolate the problem to specific components
- Identify environment-specific factors

**4. Analyze Causes**
- Brainstorm potential root causes
- Gather supporting evidence (logs, metrics, traces)
- Identify gaps in understanding

**5. Surface Options**
- Present multiple resolution approaches
- Evaluate pros, cons, and risks for each option
- Consider implementation complexity and timeline

**6. Confirm Path**
- Select the best resolution approach
- Define success criteria and validation steps
- Plan required approvals and coordination

**7. Track Actions**
- Document specific tasks and owners
- Set timelines and follow-up actions
- Plan monitoring and communication

## Use Cases

- **Bug Fixes** — Resolve unexpected behavior or errors
- **Integration Issues** — Troubleshoot system interactions
- **Performance Problems** — Analyze and fix slowdowns
- **Security Concerns** — Investigate and resolve vulnerabilities
- **Validation** — Verify fixes before deployment

## Next Steps

- **Understand code first** — See [Understanding Existing Code](/docs/understand-existing-code-with-ai-devkit)
- **Prevent bugs** — Use [/code-review](/docs/development-with-ai-devkit#code-review) before committing
- **Remember solutions** — Save fixes to [Memory](/docs/memory) so you don't repeat mistakes