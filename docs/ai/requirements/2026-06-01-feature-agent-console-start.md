---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement
**What problem are we solving?**

`ai-devkit agent console` lets users monitor agents, open an agent terminal, and send messages from the TUI, but it cannot start a new agent without leaving the console. Users must exit or switch terminals, run `ai-devkit agent start --type <type> --name <name> --cwd <cwd>`, then return to the console and wait for the list to refresh.

This interrupts the multi-agent workflow the console is designed to support. The affected users are developers managing several coding agents from the console who want to add another agent while staying in the same UI.

Current workaround: open another terminal and run `ai-devkit agent start` manually.

## Goals & Objectives
**What do we want to achieve?**

**Primary goals:**
- Pressing `s` in `agent console` switches the right workspace pane to a native Ink start-agent UI.
- The start-agent pane lets the user choose agent type, edit working directory, and edit agent name.
- The console establishes a reusable design pattern: the left agent list remains stable navigation, while the right pane is dynamic based on the active feature.
- The type field is a selection over the existing startable types: `claude`, `codex`, `gemini_cli`, `opencode`.
- The working directory field is a simple editable text field prefilled with the console process cwd.
- The name field is prefilled by reusing the existing agent name generation function.
- Submitting the start-agent pane starts the agent through the same console action runner pattern used by `open` and `send`, shelling out to the current CLI entry with `agent start --type <type> --name <name> --cwd <cwd>`.

**Secondary goals:**
- Show clear in-console success and error feedback.
- Refresh the console agent list after a successful start so the new agent appears without restarting the console.
- Keep the start-agent workspace keyboard flow small and predictable.

**Non-goals:**
- Directory browsing or fuzzy filesystem selection.
- Creating a new direct service layer for starting agents from the console.
- Changing `agent start` command behavior, validation rules, registry format, or tmux behavior.
- Supporting agent types beyond the existing `agent start` allowlist.
- Starting multiple agents from one start-pane submission.

## User Stories & Use Cases
**How will users interact with the solution?**

- As a developer in `agent console`, I want to press `s`, select `codex`, accept the generated name, and submit so that a new Codex agent starts without leaving the console.
- As a developer, I want the cwd field to default to the directory where I launched the console so that the common path needs no edits.
- As a developer, I want to edit the generated name before start so that the agent has a meaningful target name for later `send`, `open`, and console interactions.
- As a developer, I want errors from `agent start` to appear in the console so that invalid names, invalid cwd values, missing tmux, or unavailable binaries are visible without leaving the TUI.
- As a keyboard user, I want `Esc` to return from start-agent mode to the default preview/chat workspace without side effects.
- As a future feature author, I want the right pane to support alternate workspaces so that new console features can reuse the same navigation pattern.

**Key workflow:**
1. User opens `ai-devkit agent console`.
2. User presses `s`.
3. Console keeps the agent list visible on the left and replaces the right preview/chat pane with the start-agent workspace.
4. Start-agent pane shows type selection, cwd text field, and name text field.
5. User submits.
6. Console runs the existing CLI entry as `agent start --type <type> --name <name> --cwd <cwd>` via the console action runner.
7. On success, the right pane returns to preview/chat, a transient success message is shown, and the list refreshes.
8. On failure, the start-agent pane remains active, shows the error inline, and lets the user edit values and retry.

**Edge cases:**
- User presses `s` while chat input is focused: input mode should keep ownership; `s` is text, not a shortcut.
- User cancels the start-agent pane with `Esc`: no command runs and the right pane returns to preview/chat.
- User submits an empty or invalid name: show validation before running or rely on `agent start` error feedback if validation is delegated.
- User enters a missing cwd: show an error from `agent start` or pre-submit validation.
- `agent start` exits non-zero: display stderr or a fallback exit-code error.
- The agent list is empty: `s` still opens the start-agent pane.
- Terminal is narrow: the start-agent workspace replaces the available content area without overlay artifacts.

## Success Criteria
**How will we know when we're done?**

**Acceptance criteria:**
- `s` is documented in the console footer/help text as the start shortcut.
- Pressing `s` while the list is focused switches the right pane to a native Ink start-agent workspace.
- The start-agent type selector includes `claude`, `codex`, `gemini_cli`, and `opencode`.
- The start-agent name field is prefilled using the existing name generation function.
- The start-agent cwd field is prefilled with `process.cwd()` from the console process.
- Submit calls the current CLI entry with argv equivalent to `agent start --type <type> --name <name> --cwd <cwd>`.
- The action runner keeps stdio piped, matching `open` and `send`, so the subprocess does not seize the TUI terminal.
- Successful start returns the right pane to preview/chat, shows transient success, and refreshes the agent list.
- Failed start keeps the start-agent pane active and displays a clear inline error.
- Existing `o` open and `i`/`m` message shortcuts continue to work.

**Performance benchmarks:**
- Switching the right pane workspace is immediate (<100ms local render path).
- Submitting adds no additional polling beyond the existing `agent start` behavior.

## Constraints & Assumptions
**What limitations do we need to work within?**

**Technical constraints:**
- The console is built with Ink and React; the start UI must be a native right-pane workspace, not an external prompt or overlay popup.
- Existing console actions shell out through `runAction`; the start flow should follow that pattern.
- `agent start` remains the source of truth for tmux/session/registry behavior and supported type validation.
- The TUI currently centralizes keyboard handling in `ConsoleAppShell`; start shortcut handling should preserve that ownership model.
- The console provider currently owns agent list polling; successful start needs a refresh path without destabilizing existing polling.

**Assumptions:**
- `process.cwd()` in the console process is the correct default cwd.
- The existing name generation function is accessible from CLI/TUI code or can be exported without changing its behavior.
- Users are comfortable editing cwd as a path string for this version.
- The action runner can capture enough stderr from `agent start` for useful error feedback.

## Questions & Open Items
**What do we still need to clarify?**

- Confirmed: use a native Ink right-pane workspace instead of overlay/modal.
- Confirmed: follow existing console `open` and `send` action pattern.
- Confirmed: agent type should be a selection control.
- Confirmed: prefill name using the existing name generation function.
- Confirmed: keep cwd input simple for this version.
- Confirmed: failed start keeps the start-agent pane active with inline error for retry.
