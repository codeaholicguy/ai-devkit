---
title: Troubleshooting Agents & Orchestration
description: Symptom, cause, and fix for common ai-devkit agent start, send, list, and multi-agent orchestration errors on macOS and Linux.
slug: troubleshooting-agents
section: reference
order: 4
---

Use this page when `agent start`, `agent send`, `agent list`, or multi-agent orchestration fails. Format matches the [Channel](/docs/12-channel) troubleshooting style: **symptom → cause → fix**.

For permission and hook stalls, see [Per-harness permission setup](/docs/19-permissions). For the full orchestration recipe, see [Multi-agent orchestration](/docs/17-multi-agent-orchestration).

## `No session file found for agent "X"; cannot wait for response.`

**Cause:** On 0.70.1 and earlier, `send --wait` requires a session file. Most harnesses create that file only after the first user message.

**Fix:**

1. Send a plain message first: `ai-devkit agent send --id X "ready?"` (no `--wait`).
2. Then: `ai-devkit agent send --id X --wait --timeout 180000 "ready?"`.
3. On releases after 0.70.1, `send --wait` waits for the session file to appear; the two-step handshake is still recommended for booting TUIs.

## `No agent found matching "X"` right after start, or list shows `{folder}-{pid}`

**Cause:** While `agent start` waits for a stable PID, `agent list` or `agent console` can register the process under an auto name. When start finishes, the requested `--name` is dropped silently.

**Fix:**

- Do not run `agent list` or open `agent console` while a start is in progress. Wait with `tmux has-session -t <name>` or `sleep 15`.
- Rename: `ai-devkit agent rename <auto-name> <desired-name>`.
- Re-list once and use exact names from `agent list --json`.

## Codex shows `<name>-<pid>`; `agent kill impl` says no agents found

**Cause:** For Codex, the registry may store the `codex app-server` child PID instead of the TUI process, so names and kill targets disagree.

**Fix:**

- Send using the exact name from `agent list --json` (avoid short partial `--id` like `impl` if another agent matches).
- To stop: kill using the listed name, then if the tmux session remains: `tmux kill-session -t <session>` and optionally `pkill -f "codex app-server"`.

## Two agents show each other's conversation

**Cause:** Session matching uses working directory and start time. Two agents of the same type in one directory within a few minutes can be swapped.

**Fix:** One git worktree or directory per agent. See [Multi-agent orchestration](/docs/17-multi-agent-orchestration).

## Status always `process running` or empty on Linux; `--wait` never completes

**Cause:** Process cwd detection needs `lsof` on Linux. Without it, a `pwdx` fallback in 0.70.1 can fail to parse output, leaving cwd empty so no session matches.

**Fix:**

- Install `lsof` and ensure it is on `PATH` for the shell that runs `ai-devkit` and for the **tmux server** (agents inherit that environment).
- If `agent list` hangs with `lsof`, try lowering open-file limits for that command (for example `ulimit -n 1024`).

## Pi session never appears; `--wait` fails after a slow first reply

**Cause:** Pi writes its session file on first reply. Matching uses a short time window from process start; a first reply more than ~3 minutes after start may never match.

**Fix:** Start the Pi worker alone, send `ready?` immediately after start, or use a faster model. Consider `@ai-devkit/pi-session-tracker` (see [Agent Management](/docs/8-agent-management)).

## Message to OpenCode (or lead) vanished right after start

**Cause:** `agent send` types into the tmux pane. If the TUI has not finished drawing its input area, keystrokes are lost while `send` still reports success.

**Fix:** Wait ~15 seconds after start (or until the pane stops changing), send `ready?` without `--wait`, then retry with `--wait`. If status stays `process running` after 60 seconds, resend.

## `not waiting for input (status: running). Sending anyway.`

**Cause:** `send` does not block when the harness is busy. Claude Code may report `running` while idle at a prompt. Messages can queue, mix, or pair with the wrong `--wait` reply.

**Fix:** Treat `send` in scripts as best-effort unless the agent is waiting. For orchestration, use explicit handshakes and avoid back-to-back `--wait` calls without reading `agent detail`. Do not rely on `--wait` immediately after a busy send.

## List "Working On" shows `<task-notification>…` or stale `ready?`

**Cause:** Known display limitations in 0.70.x when summarizing some harness outputs.

**Fix:** Use `ai-devkit agent detail --id <name> --tail 20` for ground truth before acting.

## Codex worker stuck on "1 hook needs review"

**Cause:** Codex SessionStart hook from the curated ai-devkit plugin expects `~/.codex/hooks/codex-session-mapping.cjs`. If missing, the first `send` is swallowed.

**Fix:** Run `ai-devkit setup --agent codex`, or set `[features] hooks = false` in `~/.codex/config.toml`. See [Codex integration FAQ](/faq/ai-devkit-codex-integration) and [Per-harness permission setup](/docs/19-permissions).

## `NODE_MODULE_VERSION … compiled against a different Node.js version`

**Cause:** The CLI bundles native `better-sqlite3` built for the Node version used at `npm install -g`. Agents started in tmux with a different Node on `PATH` hit memory and other native paths.

**Fix:** Reinstall `ai-devkit` with the same Node your agents use, or set the tmux server `PATH` to that Node (`tmux set-environment -g PATH '…'`). See [Getting Started — Node.js and native modules](/docs/1-getting-started#nodejs-and-native-modules).

## `agent list` empty or stale after upgrading AI DevKit

**Cause:** An old `devkitd` can keep serving after a CLI upgrade.

**Fix:**

```bash
ai-devkit daemon stop
# retry your command
```

For debugging without the daemon: `AI_DEVKIT_NO_DAEMON=1 ai-devkit agent list` (see [Runtime (devkitd)](/docs/16-runtime)).

## `agent open` cannot focus the terminal

See [Agent Management — Troubleshooting](/docs/8-agent-management#troubleshooting) (macOS-focused terminal focus; tmux attach is the portable fallback on Linux).
