---
title: Dev Lifecycle Skill
description: Make your agent work like a senior software engineer with a structured development workflow
slug: dev-lifecycle-skill
order: 11
---

The `dev-lifecycle` skill helps agents like Claude Code and Codex work more like a senior software engineer. Instead of jumping straight into code, it pushes the agent through a disciplined workflow: understand the problem, review requirements, validate design, execute a plan, verify the implementation, write tests, and finish with code review.

This is what makes the skill useful: it keeps development simple for you while making the agent more structured. You describe the feature. The skill handles the workflow.

## Why This Skill Matters

Without structure, AI coding sessions usually drift:

- The agent starts coding before requirements are clear
- Important design decisions stay implicit
- Testing and review get skipped
- The next session loses context

The `dev-lifecycle` skill fixes that by giving the agent a repeatable software delivery process. It behaves less like a code generator and more like an engineering partner that works through the problem in the right order.

## What the Skill Actually Does

The skill runs an 8-phase workflow:

1. New requirement
2. Review requirements
3. Review design
4. Execute plan
5. Update planning
6. Check implementation
7. Write tests
8. Code review

You do not need to remember which step comes next. The skill reads the current state of your project docs, guides the next phase, and loops backward when something is unclear or incomplete.

For example:

- If requirements are incomplete, it goes back and fixes requirements first
- If the implementation does not match the design, it returns to design or implementation
- If tests reveal a design flaw, it pushes the work back to the right earlier phase

That feedback loop is the main reason the workflow feels more senior and less chaotic.

## Quick Setup

Start by initializing AI DevKit in your project:

> **Where to run these commands:** Run `init`, `lint`, and `skill add` in your terminal from the root of your project.

```bash
npx ai-devkit@latest init
npx ai-devkit@latest lint
```

Then install `dev-lifecycle` and the supporting skills that make the workflow more useful in real projects:

```bash
npx ai-devkit@latest skill add codeaholicguy/ai-devkit dev-lifecycle
npx ai-devkit@latest skill add codeaholicguy/ai-devkit debug
npx ai-devkit@latest skill add codeaholicguy/ai-devkit memory
npx ai-devkit@latest skill add codeaholicguy/ai-devkit verify
npx ai-devkit@latest skill add codeaholicguy/ai-devkit tdd
```

These supporting skills make `dev-lifecycle` more effective:

- `debug` helps the agent investigate problems before changing code
- `memory` helps the agent reuse project context across sessions
- `verify` helps the agent prove work is complete with fresh evidence
- `tdd` helps the agent write tests before or alongside implementation

Before running these commands, make sure you have:

- Node.js and `npx`
- AI DevKit available through `npx` or a global install
- A supported agent environment such as Claude Code or Codex

If `lint` fails because your AI docs have not been set up yet, rerun `init` and then run `lint` again.

If you want more background on setup, see [Agent Setup](/docs/9-agent-setup). For skill management details, see [Skills](/docs/7-skills).

## Important Dependencies

`dev-lifecycle` depends on a few project conventions:

- `docs/ai/` must exist and pass `ai-devkit lint`
- New feature work is worktree-first by default
- The skill may use memory search and store during early clarification phases
- The workflow expects verification before claiming implementation, testing, or review is complete

These dependencies are there to keep the workflow reliable, not to make it harder to use.

### Worktree-First by Default

When you start a new feature, the skill prefers a dedicated Git worktree named `feature-<name>`. This gives the agent an isolated place to work without mixing the feature into your current branch too early.

A Git worktree is an extra working folder connected to the same repository. In most cases, the agent handles this setup for you.

If you explicitly want to stay in the current repository and branch, you can ask for a no-worktree flow. The skill supports that, but the default is worktree-first because it is safer and cleaner for feature work.

### Memory and Verification

During early phases, the skill can search memory before asking you repeated questions. After you clarify something important, it can store the answer for future sessions.

Later phases rely on verification before the agent claims work is done. That helps prevent the common AI failure mode where the agent says something is complete without fresh evidence.

## How to Use It

After installing the skills, tell your agent to use `dev-lifecycle` and describe the feature you want to build.

> **Where to use this prompt:** Paste this into Claude Code or Codex chat after setup is complete. Do not run it in your terminal.

Example prompt:

"Use the dev-lifecycle skill to build an authentication feature with Google OAuth and email login. The goal is to let users sign in securely, manage sessions, and protect private dashboard routes."

From there, the skill guides the agent through:

- Clarifying the problem and user needs
- Creating or updating the right docs in `docs/ai/`
- Reviewing requirements and design
- Planning implementation work
- Building the feature
- Verifying the implementation
- Writing tests
- Running a final code review

A typical first response looks like this:

1. It asks for the feature name
2. It asks who the users are and what auth flows you need
3. It creates or checks the matching docs in `docs/ai/`
4. It starts with requirements before moving into design and implementation

## Starting a New Feature

For a new feature, the skill typically does this:

1. Searches memory for related context
2. Asks you for the feature name, problem, users, and user stories
3. Sets up a feature worktree by default
4. Creates the feature docs in `docs/ai/`
5. Fills requirements, design, and planning docs before pushing into implementation

This is the opposite of prompt-and-pray development. The agent gathers context first, then executes.

## Resuming Existing Work

If the feature already exists, the skill can continue from where you left off.

It checks:

- Your current branch and worktree state
- Whether a feature worktree already exists
- Which phase your docs indicate is currently active

That means you can return to a feature later without re-explaining everything from scratch.

## Why This Feels Simpler

The skill helps because it removes coordination overhead from the user.

Without the skill, you have to keep telling the agent:

- what phase you are in
- what document to update
- whether to review or implement next
- whether the result is actually verified

With `dev-lifecycle`, that process is already encoded. You still make the decisions, but the skill handles the workflow discipline for you.

## When to Use It

Use `dev-lifecycle` when:

- You are starting a new feature
- You want end-to-end guidance from idea to review
- You want your AI agent to follow a more disciplined engineering process
- You want better continuity across sessions

Use individual commands instead when you only need one isolated step, such as a quick code review or a test-writing pass.

## Related Docs

- For the broader workflow, see [Development with AI DevKit](/docs/3-development-with-ai-devkit)
- For installing and managing skills, see [Skills](/docs/7-skills)
- For long-term project context, see [Memory](/docs/6-memory)
