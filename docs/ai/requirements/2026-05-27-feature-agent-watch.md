---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding — Agent Watch

## Problem Statement

Users running multiple AI coding agents (Claude Code, Codex, OpenCode, Gemini CLI) have no live, single-pane view of what each agent is doing. Today they must repeatedly run `ai-devkit agent list` to see status, then `ai-devkit agent detail --id <name>` to inspect any single agent's recent activity. Switching attention between agents requires re-running commands and mentally diffing snapshots.

Adjacent products (cmux and similar terminal "mission control" tools) are gaining traction, signalling real user demand for an always-on monitor. AI DevKit already has the data sources (`agent list`, `agent detail`) and an `agent open` verb to hand control to the live session. What is missing is a thin viewer that ties them together.

**Affected users:** developers running 2+ agents in parallel during refactors, feature work, or comparative experiments. Especially relevant for ai-devkit users on macOS who already invoke `agent open`/`agent send` from their shell.

**Current workaround:** alternating between `agent list` and `agent detail`, or keeping a tmux window per agent. Both lose the "all agents at a glance" view.

## Goals & Objectives

### Primary goals
1. Provide a single TUI command (`ai-devkit agent watch`) that shows all running agents and a live preview of the selected agent's recent activity, refreshing automatically.
2. Make hand-off to existing verbs frictionless: one keystroke to `agent open`, one to `agent send`.
3. Reuse existing data sources — no new long-lived daemon, no new persistent state.

### Secondary goals
- Establish an Ink-based TUI foundation that future surfaces (history browser, multi-agent diff view) can build on without an architectural rewrite.
- Keep the watch UI fully stateless: closing it loses nothing; reopening picks up live state.

### Non-goals (v1)
- Pane splitting or multi-agent side-by-side preview.
- Killing agents from the TUI (no `kill` verb exists; would require new destructive CLI surface).
- Creating new agents from the TUI.
- Browsing historical sessions (`agent sessions` stays a separate command).
- An NDJSON `--watch` stream on `agent list` (polling is sufficient for v1; can be added later without changing the TUI shape).
- Windows support (inherits macOS/Linux constraint from the existing agent module).
- Mouse interaction.

## User Stories & Use Cases

- **As a developer running multiple agents,** I want to open one command and see every agent's status update live, so I can tell at a glance which agent needs my attention.
- **As a developer reviewing what an agent is doing,** I want to select an agent and see its last ~20 conversation messages refresh automatically, so I can decide whether to intervene without context-switching to its terminal.
- **As a developer who decides an agent needs input,** I want to press one key to jump into that agent's live terminal (via `agent open`), so the watch view feels like a hub I return to.
- **As a developer who wants to nudge an agent,** I want to press one key, type a message, and have it sent via `agent send`, so I don't need to focus the agent's terminal to dispatch a short instruction.
- **As a developer with one agent waiting for input,** I want the watch UI to surface that state visibly (e.g., highlighted row), so I notice immediately.
- **As a developer scanning the agent list,** I want the most recently active agents at the top, so the agents I'm currently working with are always visible without scrolling.

### List ordering

The TUI uses the order returned by `AgentManager.listAgents()`: status priority (WAITING → RUNNING → IDLE → UNKNOWN), then `lastActive` descending within each group. This bubbles waiting agents to the top automatically; the non-color visual cue is reinforcement, not the sole signal.

### Edge cases
- Selected agent finishes / disappears mid-session → preview greys out with an "ended" banner; cursor does not auto-jump.
- Zero agents running → empty-state hint pointing at `agent list` and the docs.
- Session file unreadable / `agent detail` fails → preview shows an error line, list continues to refresh.
- Terminal too narrow to render two panes → fall back to list-only with a footer note (`resize ≥ N cols to show preview`).
- `agent open` fails (terminal not supported) → show the error in the TUI footer, do not crash.

## Success Criteria

1. `ai-devkit agent watch` launches and displays the agent list in under 1 second on a machine with ≤10 agents running.
2. Selecting a different agent updates the preview pane in under 1 second.
3. The list reflects underlying status changes (new agent, status transition, agent ended) within 3 seconds of the change, without user input.
4. An agent in the `waiting` state is surfaced first in the list (existing `AgentManager.listAgents()` ordering: WAITING → RUNNING → IDLE → UNKNOWN, then `lastActive` desc within each group) and rendered with a non-color cue (label, glyph, or weight) in addition to color so it remains distinguishable in a monochrome terminal.
5. `⏎` cleanly suspends the TUI, executes `agent open` for the selected agent, and returns to the watch view on detach without losing selection.
6. `m` opens a prompt, captures a message, and dispatches `ai-devkit agent send --id <selected-agent>` with the captured text, returning to the watch view afterward. The prompt always targets the currently selected agent; there is no agent picker inside the prompt.
7. Existing `agent list`, `agent detail`, `agent open`, and `agent send` commands continue to work unchanged — verified via manual smoke after the change lands.
8. Manual smoke test passes with at least one Claude Code agent and one Codex agent running concurrently on macOS.
9. Performance target: the TUI remains responsive (input latency <100ms, no visible frame drops) with up to 20 concurrent agents. Behavior beyond 20 agents is best-effort and not part of v1 acceptance.

## Constraints & Assumptions

### Technical constraints
- Must run in standard macOS/Linux terminals (iTerm2, Terminal.app, tmux, common Linux emulators). No Windows support in v1.
- Must integrate cleanly with the existing TypeScript CLI in `packages/cli`.
- Hand-off to `agent open` must suspend/resume; nested-tmux behavior must not break the parent shell.
- Polling cadence (1–2s) must not noticeably degrade CPU or session-file I/O for users with many agents.

### Business / scope constraints
- Single-developer-week effort target for v1.
- No new long-running daemon; no new persistent state on disk.
- No new destructive CLI verbs (no `kill`).

### Assumptions
- `createAgentManager()` is callable in-process from the watch command, returning the same `AgentInfo[]` shape `agent list` uses today.
- Adapter `getConversation(sessionFilePath, opts)` is callable in-process and returns the same shape `agent detail` renders.
- Ink (`ink` + `ink-text-input` + `ink-select-input` or equivalent) can be added as a dependency to `packages/cli` without breaking existing builds.
- Users running the watch command have a TTY (the command refuses to start under a non-TTY stdout).

## Questions & Open Items

No material open questions at requirements time. Items deferred to design:

- Exact Ink component decomposition (list widget choice, viewport for preview).
- Whether the preview pane reads session files directly via the adapter or shells out to `agent detail --json` (perf vs boundary cleanliness).
- Footer status content and exact column widths.
- Behavior when the user resizes the terminal during a session.

These are design-phase decisions and do not block Phase 1 sign-off.
