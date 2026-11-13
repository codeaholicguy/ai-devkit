---
phase: requirements
title: Requirements & Problem Understanding
description: Event-driven `ai-devkit agent wait` to replace long sleeps in agent orchestration
---

# Requirements & Problem Understanding

## Problem Statement

**What problem are we solving?**

- The `agent-orchestration` skill tells the orchestrating agent to "sleep 15 minutes and repeat" between supervision passes.
- That instruction fails in practice:
  - Claude Code blocks foreground `sleep` and caps a Bash call at 10 minutes.
  - Codex and other harnesses kill long-running commands at their own timeouts.
  - Models often end their turn instead of sleeping, and nothing wakes them up again.
- Who is affected: anyone running a multi-agent workflow where one agent supervises others.
- Current workaround: harness-specific scheduling (`/loop`, cron), or polling by hand. Neither is portable across harnesses.

## Goals & Objectives

**Primary goals**

- Add `ai-devkit agent wait`, a blocking command that returns as soon as a watched agent changes into a state that needs attention, or at a timeout that fits inside common harness command limits.
- Make the wait event-driven: the daemon emits `agent.status_changed` from its existing sweep, so any number of concurrent waits share one sweep and none of them poll.
- Update `skills/agent-orchestration/SKILL.md` to use `agent wait` instead of `sleep`.

**Secondary goals**

- Return machine-readable output (`--json`) so an orchestrator can act on it directly.
- Keep working without a daemon, by falling back to local detection on a fixed internal interval.

**Non-goals**

- Durable (non-process) agents. `agent wait` watches live agents only, the same set `agent list` shows as running.
- Waiting for message content. `agent send --wait` already covers that.
- A user-tunable poll interval. With the daemon, `agent wait` does no polling. The no-daemon fallback uses a fixed constant.
- Harness-native scheduling integrations (`/loop`, cron).

## User Stories & Use Cases

- As an orchestrating agent, I want to block until any worker needs me (asks a question, finishes its turn, or exits), so I can react within seconds without a long `sleep`.
- As an orchestrating agent, I want to wait on specific workers (`--id a --id b`) or a group (`--group backend`), so unrelated agents on the machine don't wake me.
- As an orchestrating agent, I want the wait to end inside my harness's command limit (default 5 minutes) and report `timeout` without an error, so I can run a lightweight scan and loop again.
- As a user running several orchestrators on one machine, I want concurrent waits to cost no more than one, because they all share the daemon sweep.

**Edge cases**

- A watched agent is already `waiting` when the command starts. Don't fire. Only a change into a target state counts.
- A watched agent changes `running → waiting → running` quickly. The waiting step should still fire if a check observed it.
- Several agents change at the same moment. Report them together in one result, using a short settle window.
- A watched agent exits. This fires `exited` when it is in `--until`.
- The daemon is unavailable or disconnects mid-wait. Fall back to polling local detection.
- `--id` matches no agent, or matches more than one. Error out (non-zero exit) before waiting, the same as `agent send`.

## Success Criteria

- `ai-devkit agent wait` exists with the options `--id <name>` (repeatable), `--group <group>`, `--until <list>` (default `waiting,idle,exited`; allowed: `waiting`, `idle`, `exited`, `appeared`), `--timeout <ms>` (default `300000`) and `--json`.
- It fires only on transitions: an agent moving into a target state from a different state, an exit, or (for `appeared`) a new agent. Matching states at start are ignored.
- It returns at most one daemon sweep (about 2s) plus a 200ms settle window after the change (about 1s typical).
- On timeout it exits 0 with `reason: "timeout"`, and on a trigger it exits 0 with `reason: "triggered"`. It exits non-zero only on usage or resolution errors.
- `--json` output has `reason`, `elapsedMs` and `changes[]`, where each change has `name`, `type`, `pid`, `from` and `to` (`to` is `exited` or `appeared` for lifecycle changes).
- The daemon emits `agent.status_changed` when a sweep sees a `(pid, sessionId)` row whose `status` differs from the previous sweep.
- Without a daemon (`AI_DEVKIT_NO_DAEMON=1`), the command still works by polling local detection every 30s.
- The orchestration skill's loop step uses `agent wait` and no longer tells agents to sleep.

## Constraints & Assumptions

- The daemon sweeps every 2s (`rust/crates/devkitd/src/server.rs`). That sets how quickly status changes are noticed.
- Events are persisted with bounded retention (`EVENT_RETENTION`), so extra `status_changed` rows are acceptable.
- The console TUI refreshes on every daemon event, so it will now also refresh on status changes. That's desirable and needs no change.
- Assumption: `appeared` only applies to unfiltered waits. With `--id`/`--group`, targets are resolved once at start, so new agents are out of scope.
- Assumption: `--id` and `--group` are mutually exclusive, matching `agent send`.
- Assumption: the default 5-minute timeout fits Claude Code (10 min max) and leaves headroom for harnesses with lower limits.

## Questions & Open Items

- None. Scope was agreed with the user on 2026-11-13: fire only on changes, exit 0 on timeout, no `--interval` flag.
