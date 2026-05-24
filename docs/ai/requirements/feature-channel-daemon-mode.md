---
phase: requirements
title: "Channel Daemon Mode: Requirements"
description: Add background start and stop lifecycle support for ai-devkit channel bridges
---

# Requirements: Channel Daemon Mode

## Problem Statement

`ai-devkit channel start` currently runs the channel bridge as a foreground long-lived process. That works for local debugging, but it ties the bridge lifecycle to an active terminal and makes it awkward to keep a Telegram-to-agent bridge running while doing other work.

Developers need a daemon mode so they can start the bridge in the background, close the invoking shell, and later stop the bridge with a dedicated command.

## Goals & Objectives

### Primary Goals
- Add daemon mode to `ai-devkit channel start`.
- Add `ai-devkit channel stop` to terminate a running daemon bridge.
- Persist enough bridge metadata to make stop/status behavior deterministic.
- Preserve the existing foreground `channel start` behavior by default.

### Secondary Goals
- Keep daemon lifecycle logic inside the CLI package.
- Reuse the existing channel bridge implementation instead of duplicating bridge behavior.
- Make stale daemon state easy to detect and recover from.

### Non-Goals
- Running multiple channel bridge daemons concurrently.
- Implementing OS-specific launch agents, services, or auto-start on boot.
- Adding a new channel connector package API for daemon management.
- Managing or stopping the target AI agent process.

## User Stories & Use Cases

### US-1: Start in the Background
As a developer, I want to run `ai-devkit channel start <channel> --agent <name> --daemon` so that the channel bridge keeps running after the command returns.

### US-2: Stop the Background Bridge
As a developer, I want to run `ai-devkit channel stop` so that the running channel bridge shuts down cleanly.

### US-3: See Useful Feedback
As a developer, I want the start command to print the daemon PID and basic context so that I can tell what is running.

### US-4: Avoid Duplicate Daemons
As a developer, I want daemon start to fail when an existing bridge daemon is already running so that two bridge processes do not compete for the same Telegram bot polling stream.

### US-5: Recover from Stale State
As a developer, I want stale daemon metadata to be ignored or removed when the recorded process is no longer alive so that a crashed daemon does not block future starts.

## Success Criteria

- `ai-devkit channel start <channel> --agent <name>` still runs the bridge in the foreground.
- `ai-devkit channel start <channel> --agent <name> --daemon` spawns a detached bridge process and exits successfully after recording daemon state.
- `ai-devkit channel stop` sends a graceful termination signal to the recorded daemon process and removes daemon state once stopped.
- Stop reports a clear message when no daemon is running.
- Start refuses to launch a second daemon when the recorded PID is alive.
- Unit tests cover daemon start, duplicate prevention, stale state cleanup, and stop behavior.

## Constraints & Assumptions

### Constraints
- Follow existing TypeScript, Commander, Jest, and CLI service patterns.
- Use Node.js standard process primitives for cross-platform compatibility.
- Persist bridge state under the existing `~/.ai-devkit` area.
- Do not require additional runtime dependencies.

### Assumptions
- One daemon bridge at a time is sufficient for the current channel UX.
- The daemon can re-enter the existing `channel start` command internally with a private child-process flag.
- The existing `channel status` command can be extended later if it does not already surface daemon state.

## Questions & Open Items

- Should `channel stop` accept a channel name in the future if multiple concurrent daemons are added?
- Should daemon logs be written to a user-visible file in `~/.ai-devkit`, or should v1 redirect to ignored stdio only?
