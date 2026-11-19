---
title: Recipe — Cross-vendor lead and workers
description: Let any coding agent start, discover, and message workers from another vendor locally with ai-devkit agent commands.
slug: cross-vendor-agent-recipe
section: workflows
order: 6
---

**Let any coding agent run and talk to any other, locally.**

This recipe shows a **lead** coding agent (for example Claude Code in your main terminal) starting **workers** from a different vendor (for example Codex or opencode in tmux), discovering them with `agent list`, assigning work with `agent send`, and reading replies with `--wait`. The same commands work when the vendors are reversed — only `--type` and who runs the lead change.

For directory layout, worktrees, and a longer orchestration guide, see [Multi-agent orchestration](/docs/17-multi-agent-orchestration). Command reference: [Agent Management](/docs/8-agent-management).

## Prerequisites

On the machine:

- **Node.js 22+** (see root `engines` in the published package; [Getting Started](/docs/1-getting-started) documents the full machine setup flow)
- **tmux** (managed `agent start` uses tmux on Linux and macOS)
- **`lsof` on Linux** (strongly recommended for session detection; see [Agent Management — Linux session detection](/docs/8-agent-management#linux-session-detection))
- **Two coding-agent CLIs** installed, on your `PATH`, and signed in (for example `claude` and `codex`, or `codex` and `opencode`)
- **AI DevKit** installed and set up:

  ```bash
  npm install -g ai-devkit
  ai-devkit setup
  cd your-repo && ai-devkit init
  ```

Give the **lead** the orchestration skills (global or project):

```bash
ai-devkit skill add ai-devkit agent-management
ai-devkit skill add ai-devkit agent-communication
ai-devkit skill add ai-devkit agent-orchestration
```

The lead should call `ai-devkit agent …` itself (shell or tool use). Workers are normal interactive harness sessions started by AI DevKit.

## Scenario A — Claude lead, Codex worker

You work in Claude Code (or any session that can run shell commands). The worker is Codex in its own directory.

### 1. Isolate the worker directory

Use a separate folder or [git worktree](/docs/17-multi-agent-orchestration#layout-one-directory-per-agent) so list/send do not mix sessions:

```bash
git -C your-repo worktree add ../your-repo-codex -b feature/codex-pass
```

### 2. Start the worker (other vendor)

Start **one worker at a time**. Supported `--type` values match `agent start --help`: `claude`, `codex`, `copilot`, `gemini_cli`, `grok_cli`, `antigravity_cli`, `opencode`, `pi`, `kiro`, `devin`, `muse`.

```bash
ai-devkit agent start --type codex --name codex-worker --cwd ../your-repo-codex
```

On success you see the agent name, PID, working directory, and a tmux attach hint. While start is finishing, **do not** poll `agent list` — concurrent listing can drop a custom `--name` (see [Agent Management — naming](/docs/8-agent-management#start-an-agent)).

Wait for the tmux session instead:

```bash
sleep 15
tmux has-session -t codex-worker
```

### 3. Handshake before `--wait`

The first message should not use `--wait` (session files may not exist yet):

```bash
ai-devkit agent send --id codex-worker "ready?"
ai-devkit agent send --id codex-worker --wait --timeout 180000 "ready?"
```

Use the exact `name` from `agent list --json` as `--id` when in doubt.

### 4. Discover and inspect (lead loop)

```bash
ai-devkit agent list --json
ai-devkit agent detail --id codex-worker --json --tail 20
```

`list --json` includes fields such as `name`, `type`, `status`, `summary`, `projectPath`, and `lastActive`.

### 5. Assign work and get a reply

```bash
ai-devkit agent send --id codex-worker --wait --timeout 300000 --json \
  "Implement the TODO in README in this directory only. Run the project test command and paste the last 30 lines of output."
```

Pipe logs without pasting:

```bash
npm test 2>&1 | ai-devkit agent send --id codex-worker --stdin
```

For ongoing supervision (multiple workers), the lead loads **agent-orchestration**: after each pass, run `ai-devkit agent wait --json` (optional `--id codex-worker`), then `agent list --json` again. Default wait timeout is 300000 ms; `reason: "timeout"` is normal — scan and wait again. Do not use long shell `sleep` calls inside harness sessions.

### 6. Stop and cleanup

```bash
ai-devkit agent kill codex-worker
```

Remove the worktree when finished:

```bash
git -C your-repo worktree remove ../your-repo-codex
```

## Scenario B — Codex lead, Claude worker

Same flow; swap roles:

1. Run Codex (or any lead) in a terminal where it can execute `ai-devkit` CLI commands.
2. Start Claude as the worker:

   ```bash
   ai-devkit agent start --type claude --name claude-worker --cwd ../your-repo-claude
   ```

3. Use the same `ready?` handshake, `list` / `detail`, `send --wait`, `agent wait`, and `agent kill` steps with `--id claude-worker`.

You can pair any two types listed in `agent start --help` the same way — the lead never has to be started by `agent start`.

## Optional — durable workers (no tmux UI)

For programmatic workers without an interactive tmux session, `agent start` supports `--mode durable` for `--type claude`, `--type codex`, and `--type pi` only:

```bash
ai-devkit agent start --type codex --mode durable --name codex-print --cwd ../your-repo-codex
ai-devkit agent send --id codex-print "Summarize package.json dependencies." --json
```

`send --wait` and `--timeout` are not used the same way as interactive agents; see [Agent Management — durable mode](/docs/8-agent-management#start-an-agent).

## Common failures

| Symptom | What to check |
|--------|----------------|
| `Agent process not found after 15s. Verify that "codex" is in PATH inside the tmux environment.` | Install and sign in to that CLI; ensure the binary is on `PATH` for **tmux** (`tmux show-environment PATH` or restart tmux after fixing `PATH`). |
| `tmux is not installed or not in PATH` | Install tmux; re-run `ai-devkit setup`. |
| Custom `--name` missing in `agent list` | You listed or opened console during start; kill the stray session, restart with start-then-assign ([orchestration guide](/docs/17-multi-agent-orchestration#start-then-assign-sequence-robust-on-0701)). |
| `Invalid name "…"` | Names must be lowercase letters, digits, hyphens, 2–64 chars (`agent start` validates before spawn). |
| `No running agents found` / send cannot resolve `--id` | Run `agent list --json`; worker may have exited — check `tmux attach -t <name>` or start again. |
| `No session file found for agent …` on first `--wait` | Send plain `ready?` without `--wait` first, then retry `--wait` (see [version notes](/docs/17-multi-agent-orchestration#version-notes-0701-vs-newer)). |
| SQLite / `NODE_MODULE_VERSION` errors | Reinstall or rebuild `ai-devkit` with the same Node version your shell and tmux use ([Getting Started](/docs/1-getting-started#nodejs-and-native-modules)). |
| Empty or stale `agent list` on Linux | Install `lsof`; avoid very high `ulimit -n` if list hangs. |

More detail: [Troubleshooting: Agents & Orchestration](/docs/18-troubleshooting-agents).

## Related

- [Multi-agent orchestration](/docs/17-multi-agent-orchestration) — worktrees, lead rules template, cross-review
- [Agent Management](/docs/8-agent-management) — full command reference
- [Agent Console](/docs/13-agent-console) — human supervision and harness flags at start time
- [Per-harness permission setup](/docs/19-permissions) — avoid approval stalls on workers