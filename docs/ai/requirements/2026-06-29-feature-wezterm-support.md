---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement
**What problem are we solving?**

- `@ai-devkit/agent-manager` can discover and focus terminal sessions for an
  already-running agent in **tmux**, **iTerm2**, and macOS **Terminal.app** via
  `TerminalFocusManager` / `TtyWriter`.
- Users who run coding agents inside **WezTerm** get no terminal resolution: the
  agent is detected (PID/TTY are known) but `findTerminal` falls through to
  `UNKNOWN`, so `agent open`, `agent send`, and channel bridges cannot focus or
  type into the WezTerm pane that owns the agent.
- Current workaround: none from the CLI; users must switch panes manually.

## Goals & Objectives
**What do we want to achieve?**

- Primary goals
  - Discover the WezTerm pane that owns a running agent by matching the agent
    PID's TTY against WezTerm's panes.
  - Focus that pane (`agent open`) and send keyboard input to it (`agent send`,
    channel bridge) through WezTerm's CLI.
  - Keep all existing tmux / iTerm2 / Terminal.app behavior byte-for-byte
    unchanged.
- Secondary goals
  - Cross-platform (WezTerm runs on macOS, Linux, Windows) without AppleScript.
  - Graceful no-op when WezTerm is not installed or not running.
- Non-goals (what's explicitly out of scope)
  - Spawning new agents into WezTerm (that is `TmuxManager`'s session-create
    responsibility; WezTerm spawn is not added here).
  - Splitting/tiling panes, theming, or WezTerm config generation.
  - Detecting the WezTerm emulator version or multiplexing across multiple
    WezTerm mux servers beyond the default local instance.

## User Stories & Use Cases
**How will users interact with the solution?**

- As a developer running Claude Code/Codex/Gemini inside a WezTerm pane, I run
  `ai-devkit agent open <name>` so the WezTerm pane hosting the agent is
  focused/raised.
- As an orchestrator, I run `ai-devkit agent send "<msg>" --id <name>` so the
  text is typed into the correct WezTerm pane and submitted.
- As a channel (Telegram) bridge user, incoming messages are forwarded to the
  WezTerm pane owning the agent.
- Edge cases
  - WezTerm binary not installed → behaves as before (UNKNOWN fallback).
  - WezTerm installed but no instance running → behaves as before.
  - Agent runs inside **tmux inside WezTerm** → resolves to tmux (innermost
    first), unchanged.

## Success Criteria
**How will we know when we're done?**

- `TerminalFocusManager.findTerminal(pid)` returns a `WEZTERM` location when the
  TTY belongs to a WezTerm pane, and only when the WezTerm CLI is available.
- `focusTerminal(weztermLocation)` focuses the matching pane; returns `false` on
  any failure without throwing.
- `TtyWriter.send(weztermLocation, msg)` types the message and submits it.
- Existing tmux/iTerm2/Terminal.app tests pass unchanged.
- New unit tests cover discovery (found / not-installed / tty-mismatch) and send
  (text+Enter, failure). `npm test` for `@ai-devkit/agent-manager` is green.

## Constraints & Assumptions
**What limitations do we need to work within?**

- WezTerm is controlled exclusively through its `wezterm` CLI; no scripting host
  is assumed (so no AppleScript on non-macOS).
- We rely on the documented, stable WezTerm CLI surface: `wezterm cli list
  --format json`, `wezterm cli focus-pane --pane-id <id>`, `wezterm cli
  send-text --pane-id <id>` (stdin).
- TTY matching requires the agent process to report a TTY (same prerequisite as
  the existing emulators).
- Assumption: a single default local WezTerm mux server (the common case).

## Questions & Open Items
**What do we still need to clarify?**

- None blocking. Spawn-into-WezTerm and multi-server muxing are deferred as
  explicit non-goals above.
