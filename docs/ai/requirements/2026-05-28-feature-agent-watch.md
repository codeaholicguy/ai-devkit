---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

Developers running multiple AI agents (Claude Code, Codex, Gemini CLI, OpenCode) have no unified view of what those agents are doing. They must switch terminal windows to check status, find logs, or send messages. This creates context-switching overhead and makes it easy to miss stuck or waiting agents.

## Goals & Objectives

**Primary goals**
- Provide a real-time TUI dashboard (`agent console`) that lists all detected running agents with live status
- Allow the user to inspect an agent's recent conversation without leaving the console
- Allow the user to send a message to a selected agent from within the TUI
- Allow the user to open a selected agent's terminal session

**Non-goals**
- Full conversation history (preview shows last 20 messages only)
- Multi-agent message broadcast
- Managing agent lifecycle (start/stop)

## User Stories & Use Cases

- As a developer, I want to see all my agents' statuses at a glance so I can detect stuck or idle agents quickly
- As a developer, I want to read the last few messages of any agent's conversation without switching windows
- As a developer, I want to send a message to an agent from the console so I can unblock it without interrupting my current context
- As a developer, I want to open an agent's full terminal UI from the console

## Success Criteria

- `agent console` renders within 1s of launch
- Agent list refreshes every 3s without noticeable layout shifts
- Keyboard navigation (j/k/o/i/q) works immediately on launch
- Conversation preview updates every 3s; fast cursor movement does not cause excessive I/O
- Action feedback (open/send) is displayed without unmounting the TUI
- Works in terminals ≥ 80 cols; preview pane shown when terminal ≥ 120 cols

## Constraints & Assumptions

- Terminal must support at least 80 columns and 24 rows for usable layout
- Ink 7 + React 19 ESM — `useInput` must live in a single non-memo component to avoid silent failures
- Agent session files are JSONL on disk; parsing happens synchronously per selection
- Actions (open/send) are dispatched by re-invoking the CLI as a subprocess so the TUI stays alive
