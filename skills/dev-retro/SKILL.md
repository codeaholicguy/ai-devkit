---
name: dev-retro
description: AI DevKit · Run an evidence-based retrospective on finished work (feature, session, incident) and turn friction into durable fixes, automation first. Use when users ask for a retro, lessons learned, post-mortem, or "what went wrong", or when another skill offers one after a feature or fix.
---

# Retro

Turn what went wrong into fixes that stop it recurring. Not a status summary: use `session-compact` for handoff state.

## Rules

- When suggested by another skill, ask the user before running; skip silently if declined.
- Every item needs evidence: a failed command, hook or test output, a user correction, a revert, or rework in the diff. No generic lessons.
- Cap at the 3-5 highest-cost items. Note what worked in one line only if it should be kept on purpose.
- Blameless: describe the gap in the system, not the person or agent.
- Never copy secrets, credentials, or personal data from transcripts into fixes or memory.

## Fix Ladder

Pick the highest rung that works:

1. Automate: test, lint rule, hook, CI check, build dependency.
2. Fix the tool: script, template, default config.
3. Instruct: skill, `AGENTS.md` / `CLAUDE.md`, docs.
4. Remember: `memory` entry, only for knowledge that cannot be enforced. Search first; update instead of duplicating.
5. Drop: one-off with no pattern.

## Workflow

1. Scope the work: feature, branch, session, or incident, and its commit range.
2. Gather evidence: `git log` and diff for the range, failed or retried commands, hook/CI failures, `task` evidence, user corrections. Use the session transcript when available (`agent sessions`, `session-compact`); do not require it.
3. For each item, record: what happened, cost (time, rework, risk), root cause in one line, and the fix with its rung, exact file or command.
4. Present the items and wait for approval. Memory-only fixes may proceed; skill, config, CI, and code changes need explicit approval.
5. Apply approved fixes, validate each with `verify` (a new check must fail on the old state when practical), and commit per the user's workflow.
6. Report: fixes applied with rung, items dropped and why, follow-ups left open.

## Stop

Pause when evidence is missing, a fix needs a team or ownership decision, or the root cause is unclear; hand unclear failures to `dev-debug`.
