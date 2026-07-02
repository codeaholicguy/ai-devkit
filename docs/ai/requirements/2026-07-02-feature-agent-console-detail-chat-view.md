---
phase: requirements
title: Agent Console Detail Chat View
description: Make the interactive agent console detail pane focusable and scrollable so users can inspect chat content
---

# Requirements & Problem Understanding

## Problem Statement

Users can open the interactive agent console and move through agents in the list, but the right-side preview/detail pane is passive. It shows recent conversation content when space allows, yet users cannot intentionally focus that pane, see that it is active, or scroll through chat content.

This affects developers supervising multiple AI agents from `ai-devkit agent console`. When an agent has a longer conversation, the current workaround is to leave the console and use `ai-devkit agent detail --id <name>` or inspect the underlying session file. That breaks the console workflow and makes quick review difficult.

## Goals & Objectives

Primary goals:

- Let users press `v` from the agent list to focus the selected agent's detail/chat pane.
- Visually highlight the detail pane when it is focused, matching the existing panel focus style.
- Let users scroll the focused detail/chat pane up and down to inspect conversation content.
- Preserve existing list navigation, message input, start, rename, channel, open, kill, help, and quit shortcuts.
- Keep the preview polling and conversation parsing behavior adapter-agnostic through the existing `useAgentConversation` and `AgentAdapter.getConversation()` path.

Secondary goals:

- Provide small scroll affordances when additional chat content exists above or below the viewport.
- Keep keyboard behavior predictable for both arrow-key users and `j/k` users.

Non-goals:

- Adding a separate full-screen transcript viewer.
- Editing, exporting, searching, filtering, or copying chat content.
- Changing `ai-devkit agent detail` CLI output.
- Supporting historical/non-running agents beyond what the console already lists.
- Changing session parsing semantics or adding verbose tool-result rendering to the console preview.

## User Stories & Use Cases

- As a developer, I want to select an agent in the console and press `v` so that I can inspect that agent's chat without leaving the console.
- As a developer, I want the detail pane to visibly show focus so that I know scroll keys affect the chat, not the agent list.
- As a developer, I want to scroll up and down through the selected agent's conversation so that I can review earlier context and return to the newest messages.
- As a developer, I want to leave detail focus quickly so that I can continue selecting other agents or send a message.

Key workflow:

1. User runs `ai-devkit agent console`.
2. User navigates the agent list with up/down or `j/k`.
3. User presses `v`.
4. The detail/chat pane becomes focused and highlighted.
5. User scrolls chat content with up/down or `j/k`.
6. User presses `Esc` or left arrow to return focus to the agent list.

Edge cases:

- No agent is selected: `v` is ignored and the console remains stable.
- Selected agent has no session file or no messages: the focused pane still shows the existing empty/error state and does not crash.
- Conversation is shorter than the viewport: scroll commands are no-ops.
- Conversation updates while the detail pane is focused: the pane should keep a stable scroll position unless the user is already at the latest content, in which case it may stay pinned to the bottom.
- Narrow terminal mode currently hides the preview; `v` should not introduce an unusable hidden focus state.

## Success Criteria

- Pressing `v` from list focus changes console focus to the detail/chat pane when a selected agent exists.
- The detail/chat panel uses the focused panel styling while detail focus is active.
- While detail focus is active, up/down arrows and `j/k` scroll chat content instead of changing the selected agent.
- Pressing `Esc` or left arrow from detail focus returns to list focus.
- Existing list navigation still works when list focus is active.
- Existing input focus behavior still works for `i`/`m`, message submit, and input cancel.
- The implementation includes focused unit coverage for scroll calculations and key-handling helper behavior, plus regression coverage for panel focus state where practical.
- Feature lint passes for `agent-console-detail-chat-view`.

## Constraints & Assumptions

Technical constraints:

- Console UI is implemented with Ink components under `packages/cli/src/tui/console`.
- `ConsoleFocus` currently supports `list` and `input`; this feature will add a detail/preview focus state.
- `PreviewSection` already fetches selected-agent messages through `useAgentConversation`, with a default tail of 20 messages.
- The feature should avoid synchronous conversation parsing on every scroll keypress.
- The console must remain usable in terminals near the existing minimum layout dimensions.

Assumptions:

- The requested "detail pane" maps to the existing right-side `PreviewSection`/`PreviewPane`.
- `v` is available as a new shortcut and does not conflict with existing console shortcuts.
- In wide mode, detail focus applies to the right-side preview panel; in narrow mode, `v` can be a no-op until a separate narrow replacement view is designed.
- Showing and scrolling the current non-verbose conversation preview is sufficient for this iteration.

## Questions & Open Items

No blocking open questions for the first implementation.

Deferred questions:

- Should a future version support a full-screen transcript view in narrow terminals?
- Should the console expose a toggle for verbose tool-call/tool-result messages?
- Should page-wise scrolling (`PageUp`/`PageDown`, `g`/`G`) be added after basic up/down scrolling lands?
