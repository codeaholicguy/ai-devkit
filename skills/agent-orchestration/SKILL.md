---
name: agent-orchestration
description: AI DevKit · Supervise multi-agent workflows over repeated passes: poll progress, unblock waiting agents, coordinate dependencies, relay outputs, resolve conflicts, and verify completion. Use only for ongoing multi-agent coordination, not one-off list/detail/send/start/kill actions.
---

# Agent Orchestration

Use only for multi-agent supervision: coordinating dependencies, polling progress, unblocking waiting agents, relaying outputs, resolving conflicts, and verifying completion across agents. For one-off list/detail/send/start/kill work, use `$agent-management` or `$agent-communication`.

Use `$agent-management` for safe agent selection and lifecycle actions. Use `$agent-communication` for list/detail/send mechanics. Use `$verify` before accepting any agent's completion claim.

## Rules

- Own the loop until assigned work is complete, blocked, or stopped.
- Run `agent list --json` before each pass; never assume names/statuses.
- Inspect waiting, idle, unknown, missing, or stale agents before acting.
- Send self-contained instructions and avoid duplicate follow-ups.
- Sequence agents that touch the same files; relay only relevant upstream output.
- Escalate only for repeated failures, unresolved conflicts, product/business decisions, or destructive/shared/production/security-sensitive actions.

## Loop

If the goal or agent ownership is unclear, run one scan/detail pass. Ask the user once only if context is still insufficient.

1. Scan agents.
2. Assess agents needing attention with `detail --tail 10`.
3. Act: approve, clarify, correct, delegate, relay, verify, or escalate.
4. Report one brief status line.
5. Sleep 10-60s and repeat.

## Completion

Finish when all assigned work is verified, blocked with a clear reason, or stopped by the user. Summarize per-agent outcomes, verification, unresolved issues, and next step.
