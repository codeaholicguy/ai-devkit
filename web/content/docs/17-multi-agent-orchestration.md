---
title: Multi-Agent Orchestration
description: Run a lead coding agent with Codex, OpenCode, and other workers using ai-devkit agent start and agent send, with worktree isolation and cross-review.
slug: multi-agent-orchestration
section: workflows
order: 5
---

Use this guide when one coding agent (the **lead**) supervises other **workers** through `ai-devkit agent start` and `ai-devkit agent send`. You stay in your shell (or inside the lead's session); workers run in separate tmux sessions that AI DevKit can address by name.

For day-to-day monitoring without a lead agent, use [Agent Console](/docs/13-agent-console) instead.

## When to use a lead agent vs the console

| Approach | Best for |
|----------|----------|
| **Lead agent + workers** | Scripted delegation, cross-harness review (for example Claude lead with Codex and OpenCode workers), CI-style loops |
| **`agent console`** | Human supervision, quick messages, starting one agent at a time with harness CLI args |
| **Channels** | Operating a single running agent from Telegram or Slack |

Managed `agent start` uses **tmux** on macOS and Linux. The console is experimental on those platforms and is not supported on Windows. See [Agent Console](/docs/13-agent-console) and [Getting Started](/docs/1-getting-started).

## Layout: one directory per agent

Give every worker its own working directory. Session matching uses project path and start time; two agents in the same folder can show each other's conversations in `agent list`, `agent console`, or `send --wait`.

Use a **git worktree** per worker when they touch the same repository:

```bash
git -C my-repo worktree add ../my-repo-impl -b feature/impl
git -C my-repo worktree add ../my-repo-tests -b feature/tests
```

Typical layout:

```text
team/
├── lead/          # lead agent cwd (integration, merges)
├── impl/          # worker: implementation
└── tests/         # worker: test fixes
```

Point each `agent start --cwd` at the correct tree. See [Troubleshooting: Agents & Orchestration](/docs/18-troubleshooting-agents) if names or sessions look wrong.

## Install skills for the lead

Built-in skills cover single-agent management:

- `agent-management` — start, assign, kill
- `agent-communication` — `send`, `--wait`, `--stdin`

`agent-orchestration` is **not** in the default built-in set. Add it when the lead should run a long supervision loop:

```bash
ai-devkit skill add ai-devkit agent-orchestration
```

## Version notes (0.70.1 vs newer)

| Behavior | On 0.70.1 and earlier | After session-wait fix ships (merged on `main`, not yet in npm `latest` at 0.70.1) |
|----------|----------------------|-------------------------------------------------------------------------------------|
| First `send --wait` right after `start` | Fails with `No session file found for agent …` until the harness creates a session file | `send --wait` can wait for the session file to appear |
| Recommended handshake | Plain `ready?` first, then `send --wait` | Plain `ready?` is still a good readiness check |

Always follow the **start-then-assign** sequence below on 0.70.1.

## Start-then-assign sequence (robust on 0.70.1)

Start workers **one at a time**. Do not run `agent list`, `agent console`, or tight list loops while a worker is still starting — a concurrent list can register an auto name and **drop your `--name`** (see [Known limitations](/docs/8-agent-management#known-limitations)).

For each worker:

1. **Start** (example):

   ```bash
   ai-devkit agent start --type codex --name impl --cwd ../my-repo-impl
   ```

2. **Wait for the tmux session** (do not poll `agent list` during this window):

   ```bash
   sleep 15
   tmux has-session -t impl 2>/dev/null
   ```

3. **First message without `--wait`** (creates or wakes the session file on most harnesses):

   ```bash
   ai-devkit agent send --id impl "ready?"
   ```

4. **Confirm with wait** (up to 3 retries if needed):

   ```bash
   ai-devkit agent send --id impl --wait --timeout 180000 "ready?"
   ```

5. **Re-list once** if `send` cannot find the name, then use the exact name from `agent list --json`. Prefer exact `--id` values; partial matches can hit the wrong agent.

Dispatch long tasks with the harness's own background mechanism (for example Claude Code `run_in_background`), not shell `&` in a single command, so approval rules stay predictable.

## Lead rules template

Copy into the lead's `AGENTS.md` or `CLAUDE.md` (adjust paths and worker names):

```markdown
# Multi-agent lead rules

## Workers
- impl: Codex, cwd ../my-repo-impl
- tests: OpenCode, cwd ../my-repo-tests

## Starting workers
1. Start one worker at a time with `ai-devkit agent start --type <type> --name <name> --cwd <path>`.
2. Never run `ai-devkit agent list` or `agent console` while a start is in progress.
3. After each start: `sleep 15`, then `ai-devkit agent send --id <name> "ready?"` (no --wait).
4. Then `ai-devkit agent send --id <name> --wait --timeout 180000 "ready?"` up to 3 times.
5. Use exact agent names from `ai-devkit agent list --json`.

## Commands
- Use `git -C <path>` and absolute paths; do not `cd` in shell commands.
- Do not use `&` in shell; use the harness background tool when needed.
- Do not call `tmux` from the lead.

## Work assignment
- Give each worker a self-contained task, scope, and validation command.
- After workers finish, have worker A review B's diff against SPEC.md (LGTM or numbered findings).
- Integrate with `git -C team/lead merge …` and run tests before claiming done.
```

Configure harness permissions so workers do not stall on approval prompts — see [Per-harness permission setup](/docs/19-permissions).

## Worked example: Claude lead, Codex + OpenCode workers

Prerequisites: `ai-devkit setup`, project `init`, `tmux`, and `lsof` on Linux (see [Getting Started](/docs/1-getting-started)).

```bash
# Machine setup once
npm install -g ai-devkit
ai-devkit setup

# Project
cd my-repo && ai-devkit init

# Worktrees
git worktree add ../my-repo-impl -b demo/impl
git worktree add ../my-repo-tests -b demo/tests

# Start workers (one at a time; run the ready? handshake after each)
ai-devkit agent start --type codex --name impl --cwd ../my-repo-impl
# … sleep 15, send ready? twice as above …

ai-devkit agent start --type opencode --name tests --cwd ../my-repo-tests
# … ready? handshake …

# Lead (human or Claude Code in team/lead) assigns tasks with send --wait
ai-devkit agent send --id impl --wait --timeout 300000 "Implement TODO in SPEC.md; run npm test in this directory."
```

Cross-review step (lead or a worker):

```bash
ai-devkit agent send --id impl --wait --timeout 300000 "Review the diff in ../my-repo-tests against SPEC.md. Reply LGTM or a numbered list of issues."
```

## Console-only harness flags

`ai-devkit agent start` accepts `--type`, `--mode`, `--name`, `--cwd`, and `--debug`. It does **not** pass an initial prompt or harness CLI flags (for example Codex `--ask-for-approval never` or Gemini `--approval-mode=yolo`).

To pass those at start time, use **Agent Console** (`s` → **task** and **args** fields) or start the harness manually in tmux and let AI DevKit detect it. See [Agent Console — Start an agent](/docs/13-agent-console).

## Related docs

- [Agent Management](/docs/8-agent-management) — command reference and known limitations
- [Troubleshooting: Agents & Orchestration](/docs/18-troubleshooting-agents)
- [Per-harness permission setup](/docs/19-permissions)
- [Skills](/docs/7-skills) — installing `agent-orchestration`
