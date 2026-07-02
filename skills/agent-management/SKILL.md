---
name: agent-management
description: AI DevKit · Manage running AI agents with ai-devkit agent commands. Use when an agent needs to identify itself, list agents, start workers, inspect agent detail, assign work, group agents, resume sessions, stop agents, or delegate work to other agents.
---

# Agent Management

Use `ai-devkit agent ...`; if unavailable, use `npx ai-devkit@latest agent ...`.

## Workflow

1. List agents: `ai-devkit agent list --json`.
2. Identify self: compare your current session id to `sessionId` from `list --json`
3. Inspect before acting: `ai-devkit agent detail --id <name> --json --tail 20`.
4. Reuse idle agents when suitable; otherwise start one with `agent start`.
5. Send self-contained assignments. Track each agent's task and last instruction.
6. Verify completed work before reporting it done. Use `$agent-communication` for agent-to-agent updates.

## Commands

```bash
ai-devkit agent list --json
ai-devkit agent detail --id <name> --json --tail 20
ai-devkit agent start --type codex --name <name> --cwd <path>
ai-devkit agent send --id <name> "<single-line instruction>"
ai-devkit agent send --id <name> --wait --timeout 120000 --json "<single-line instruction>"
ai-devkit agent send --group <group> "<single-line instruction>"
ai-devkit agent sessions --cwd <path> --type codex --json --limit 20
ai-devkit agent rename <old-name> <new-name>
ai-devkit agent kill <name>
```

Use exact names from `list --json`. Partial matches are convenient but risk sending work to the wrong agent.

## Assignment Rules

- Do not send instructions to yourself unless intentional.
- Prefer task names like `auth-review`, `ui-tests`, or `docs-pass`.
- Include objective, scope/files, constraints, validation command, expected output, and whether to stop or continue.
- Assign non-overlapping files or sequence dependent work.
- Use groups only for broadcasts that truly apply to every member.
- Ask before killing agents you did not start, destructive actions, production/shared-system actions, or product decisions.

Example:

```bash
ai-devkit agent send --id auth-review "Review auth middleware in /repo. Do not edit files. Report security findings with file/line references, ranked by severity."
```
