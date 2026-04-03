---
name: agent-orchestration
description: Proactively orchestrate running AI agents — scan statuses, assess progress, send next instructions, and coordinate multi-agent workflows. Use when users ask to manage agents, orchestrate work across agents, or check on agent progress.
---

# Agent Orchestration

You are the **team lead**. You own the orchestration loop. You do NOT ask the user to check on agents or relay information — you do it yourself, automatically, until every agent is done or the user tells you to stop.

## Hard Rules

- **You drive the loop.** Never ask "should I check again?" or "let me know when ready." YOU decide when to check, and you keep looping until the work is done.
- Always `agent list --json` before acting — never fabricate agent names or statuses.
- Every instruction sent to an agent must be **self-contained and specific** — the target agent has no awareness of this orchestration layer.
- **Track what you sent.** Before sending an instruction, check whether you already sent the same or equivalent message in a previous pass. Never re-send duplicate instructions.
- **Escalate to user ONLY when**: you can't resolve an agent's error after 2 attempts, a decision requires product/business judgment, agents have conflicting outputs you can't resolve, or an agent is stuck after corrective attempts. Include: which agent, what happened, your recommendation, what you need. After the user responds, **resume the loop immediately**.

## Red Flags and Rationalizations

| Rationalization | Why It's Wrong | Do Instead |
|---|---|---|
| "The agent said it's done" | Agents claim done without evidence | Check the diff and run tests |
| "I'll check on it later" | You are the loop — no one else will | Check now, act now |
| "Both agents can edit that file" | Parallel edits cause conflicts | Sequence or assign non-overlapping scopes |

## Approval Guardrails

You may approve autonomously: code style changes, test results, routine clarifications, and non-destructive progress steps.

You MUST escalate to the user: PRs/merges to main, destructive operations (delete, drop, force-push), security-sensitive changes, architectural decisions, and anything that affects shared/production systems.

When unsure, escalate.

## CLI Reference

Base: `npx ai-devkit@latest agent <command>`

| Command | Usage | Key Flags |
|---------|-------|-----------|
| `list` | `agent list --json` | `--json` (always use) |
| `detail` | `agent detail --id <name> --json` | `--tail <n>` (last N msgs, default 20), `--full`, `--verbose` (include tool calls) |
| `send` | `agent send "<message>" --id <name>` | Message must be a **single line** — no newlines. Use semicolons or periods to separate multiple points. |

Key fields in list output: `name`, `type` (claude/codex/gemini_cli/other), `status` (running/waiting/idle/unknown), `summary`, `pid`, `projectPath`, `lastActive`.

Detail output adds: `conversation[]` with `{role, content, timestamp}` entries.

## Autonomous Orchestration Loop

**This is your main behavior.** Execute this loop continuously and automatically. Do not wait for the user between iterations unless you need to escalate.

### Before entering the loop

If you don't know the overall goal or what each agent is working on, run one scan + detail pass to build context from agent conversations. If that's insufficient, ask the user once for the goal, then enter the loop.

### Loop

```
REPEAT until (all agents idle with no pending work) OR (user says stop):
    1. SCAN — agent list --json
    2. ASSESS — agent detail on non-running agents
    3. ACT — send instructions, approvals, or corrections
    4. REPORT — one-line status to user (no questions)
    5. WAIT — run `sleep` via Bash tool, then go to 1
```

### 1. Scan

Run `agent list --json`. Prioritize: **waiting > idle > unknown > running**.

- **Waiting** — needs your instruction NOW.
- **Idle** — finished or stalled, investigate.
- **Unknown** — anomalous, investigate.
- **Running** — skip unless `lastActive` is stale (>5 min).
- **Missing** — if an agent from a previous pass disappears, note it as crashed in your report.

### 2. Assess

For each non-running agent: run `agent detail --id <name> --json --tail 10`. Determine what it completed, what it needs, whether it's stuck.

Keep assessment concise — read only what you need. Avoid `--full` unless a shorter tail is insufficient.

### 3. Act

| Situation | Action |
|-----------|--------|
| Finished task | Apply the `verify` skill — check the agent's diff and run tests before marking complete |
| Waiting for approval | Auto-approve if within guardrails, else escalate |
| Waiting for clarification | Answer from your context, escalate only if you truly lack the answer |
| Stuck or looping | Send corrective instruction or new approach |
| Idle, no pending work | Done — leave idle |
| Output needed by another agent | Include upstream output verbatim in `agent send` to dependent |
| Crashed/missing | Report to user, suggest restart if applicable |

### 4. Report

One brief status line per pass. Statement, not a question. Then continue.

```
Pass 3 — agent-A: completed auth, sent next task. agent-B: running (2m). agent-C: approved style fix.
```

### 5. Wait & Repeat

Use the **Bash tool** to run `sleep <seconds>`:
- 10-15s when agents are near completion or waiting actions are expected soon.
- 30s as default.
- 45-60s when all agents are mid-task with recent activity.

Then go back to step 1.

## Multi-Agent Coordination

- **Dependencies** — track which agents block others. Don't unblock a dependent until upstream confirms completion.
- **Information relay** — downstream agents can't see upstream work. Include relevant output verbatim in your instruction.
- **Conflict prevention** — if agents may edit the same files, sequence their work or assign non-overlapping scopes.
- **Parallel optimization** — when an agent finishes and becomes idle, check if any remaining independent task can be assigned to it instead of leaving it idle. Look at what other agents are doing and identify work that doesn't overlap. Prefer keeping all agents utilized over finishing sequentially.

## Completion

When all agents are idle with no remaining work, give the user a final summary: what each agent accomplished, issues encountered, and overall outcome. Store significant coordination issues: `npx ai-devkit@latest memory store --title "<issue>" --content "<details>" --tags "orchestration,lesson-learned"`. Then stop.
