---
name: agent-orchestration
description: Proactively orchestrate running AI agents — scan statuses, assess progress, send next instructions, and coordinate multi-agent workflows. Use when users ask to manage agents, orchestrate work across agents, or check on agent progress.
---

# Agent Orchestration

Act as a **lead orchestrator** for running AI agents. Proactively scan, assess, decide, and instruct in a continuous loop. Ask the user for direction only when you lack context to decide.

## Hard Rules

- Always `agent list --json` before acting — never fabricate agent names or statuses.
- Every instruction sent to an agent must be **self-contained and specific** — the target agent has no awareness of this orchestration layer. Never send vague messages like "continue".
- **Escalate to user** when: you can't diagnose an agent's error, a decision needs product/business judgment, agents have conflicting outputs, or an agent stays stuck after corrective attempts. Include which agent, what happened, your recommendation, and what you need.

## CLI Reference

Base: `npx ai-devkit@latest agent <command>`

| Command | Usage | Key Flags |
|---------|-------|-----------|
| `list` | `agent list --json` | `--json` (always use) |
| `detail` | `agent detail --id <name> --json` | `--tail <n>` (last N msgs, default 20), `--full`, `--verbose` (include tool calls) |
| `send` | `agent send "<message>" --id <name>` | |

Key fields in list output: `name`, `type` (claude/codex/gemini_cli/other), `status` (running/waiting/idle/unknown), `summary`, `pid`, `projectPath`, `lastActive`.

Detail output adds: `conversation[]` with `{role, content, timestamp}` entries.

## Orchestration Loop

Run continuously until all agents are done or the user says stop. After each pass, give the user a brief status update.

### 1. Scan

Run `agent list --json`. Prioritize by status: **waiting > idle > unknown > running**.

- **Waiting** — needs your instruction now.
- **Idle** — finished or stalled, investigate.
- **Unknown** — anomalous state, investigate.
- **Running** — skip unless long-running or blocking another agent.

If all agents are running, inform the user and wait for them to request the next check.

### 2. Assess

For each non-running agent needing attention:
- Run `agent detail --id <name> --json --tail 10`.
- Determine: what it finished, what it's asking, whether it's stuck.

### 3. Decide and Act

| Situation | Action |
|-----------|--------|
| Finished task | Send next task via `agent send`, or note complete and move on |
| Waiting for approval | Review its output, send approval or change requests via `agent send` |
| Waiting for clarification | Answer its question via `agent send`, or escalate to user |
| Stuck or looping | Send corrective instruction or new approach via `agent send` |
| Idle, no pending work | Assign new work via `agent send`, or leave idle |
| Output needed by another agent | Extract relevant output, include it in `agent send` to the dependent agent |
| Insufficient context | Ask user for direction |

## Multi-Agent Coordination

When agents work on related tasks:

- **Dependencies** — track which agents block others. Don't unblock a dependent until the upstream confirms completion.
- **Information relay** — include upstream output directly in the instruction to the downstream agent.
- **Conflict prevention** — if agents may edit the same files, sequence their work or assign non-overlapping scopes.
