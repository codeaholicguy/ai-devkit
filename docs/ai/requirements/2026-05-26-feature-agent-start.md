---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

Developers using `ai-devkit` can monitor and send messages to running agents via `agent list` and `agent send`, but they have no CLI-native way to launch a new agent. Starting a claude/codex session today requires manually opening a terminal, running the tool, and keeping track of which terminal holds which agent. This makes agent names in `agent list` opaque (auto-generated from CWD+PID), and offers no way to assign a human-readable name that persists across `agent send` invocations.

Affected users: anyone using `ai-devkit` as an orchestration layer for multiple AI coding agents.

Current workaround: manually start `claude` or `codex` in a tmux pane, then copy the auto-generated name from `agent list` output.

## Goals & Objectives

**Primary goals:**
- Add `npx ai-devkit agent start --type <type> --name <name>` to launch an agent in a managed tmux session
- Register the user-supplied name in a persistent local registry so `agent list` and `agent send` surface it instead of the CWD+PID auto-name
- Support `--cwd <path>` to control the working directory of the agent (default: current directory)

**Secondary goals:**
- Print attach instructions after start so users know how to view the session interactively
- Prune stale registry entries (dead PIDs) automatically on read

**Non-goals:**
- Managing tmux sessions beyond creating them (no `agent stop` in this feature)
- Supporting agent types that don't have a corresponding adapter (in scope: `claude`, `codex`, `gemini_cli`, `opencode`)
- Cross-machine or remote agent launching
- Modifying how Claude Code or Codex write their session files

## User Stories & Use Cases

- As a developer, I want to run `npx ai-devkit agent start --type claude --name backend` so that I have a named agent I can target with `agent send --id backend` without memorising a PID-derived name.
- As a developer, I want to run `agent start --type codex --name frontend --cwd ~/projects/ui` so that the agent starts in the right project directory.
- As a developer, I want `agent list` to show `backend` (my chosen name) rather than `ai-devkit-12345` so I can orient myself quickly when managing multiple agents.
- As a developer, I want the command to fail clearly if tmux is not installed, if the name is already taken by a running agent, or if the agent type is unsupported.

**Edge cases:**
- `--name` already exists in the registry with a live PID → error, prompt to use a different name
- `--name` exists in registry but PID is dead → prune and allow reuse
- `--cwd` does not exist → error before creating the tmux session
- tmux not installed → clear error with install hint
- User runs `agent start` inside an existing tmux session → still works (nested tmux is allowed; document it)

## Success Criteria

- `npx ai-devkit agent start --type claude --name myagent` creates a detached tmux session named `myagent`, starts `claude` inside it, and registers the name in the local registry.
- `npx ai-devkit agent list` shows `myagent` (not `<folder>-<pid>`) for that agent.
- `npx ai-devkit agent send --id myagent "hello"` successfully sends to the agent started above.
- `npx ai-devkit agent open myagent` focuses the tmux pane for an agent started via `agent start` (registry-first resolution applies to all `resolveAgent` callers).
- The command exits non-zero with a clear message when: tmux is missing, name is taken, cwd is invalid, type is unsupported, or the agent binary is not found (PID poll timeout).
- Registry entries whose PIDs are no longer alive are silently pruned on next read.

## Constraints & Assumptions

**Technical constraints:**
- tmux must be installed and available in `PATH`; the command will not install it
- Agent detection still relies on existing adapter process scanning — the registry only overlays the name, not the detection mechanism
- Supported `--type` values: `claude`, `codex`, `gemini_cli`, `opencode` (all four registered adapters). Each type maps to a launch command and a process matcher via `AGENTS` in `@ai-devkit/agent-manager` (e.g. `gemini_cli` → command `gemini`, matched anywhere in the `ps` command line).
- `--name` must match `/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/` (lowercase alphanumeric + hyphens, 2–64 chars); this is validated at the CLI before any tmux interaction

**Assumptions:**
- Users are on a Unix-like OS where tmux is available (macOS, Linux)
- The agent binary (`claude`, `codex`, `gemini`, `opencode`) is in `PATH` inside the tmux session environment; if not, the start command will time out and clean up
- `~/.ai-devkit/` is a writable directory for the registry file

**PID poll timeout behavior:**
- After sending the agent command to tmux, `agent start` polls for the child process PID for up to 5 seconds (500ms interval)
- If the PID is never found (e.g., binary not in PATH, immediate crash), the tmux session is torn down (`tmux kill-session -t <name>`) and the command exits non-zero with a message explaining the timeout and suggesting the user verify the binary is in PATH
- The session is not left running in an unknown state

## Questions & Open Items

- Should `agent start` output the auto-attach command automatically (e.g., `tmux attach -t myagent`)? → Yes, print it as part of success output.
- Should `agent send --id` and `agent open <name>` fall back to registry lookup before CWD+PID matching? → Yes (registry-first resolution applies to all subcommands that call `resolveAgent`).
