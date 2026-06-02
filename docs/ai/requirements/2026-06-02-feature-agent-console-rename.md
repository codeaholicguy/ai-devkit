---
phase: requirements
title: Agent Console Rename
description: Add selected-agent rename support to the interactive agent console
---

# Requirements & Problem Understanding

## Problem Statement

Developers can rename managed agents from the CLI with `agent rename <current-name> <new-name>`, but `ai-devkit agent console` does not expose that action. Users managing agents inside the console must leave the TUI, run the CLI command manually, then return to the console.

Affected users: developers who manage multiple running agents from `agent console`, especially long-lived tmux-backed agents with auto-generated names.

## Goals & Objectives

- Add a keyboard-driven rename action to `agent console`.
- Use lowercase `r` to open rename mode for the currently selected agent.
- Present rename as a native console workspace, following the existing right-pane pattern used by console start.
- Prefill the rename input with the selected agent's current name.
- Submit via the existing `agent rename <current-name> <new-name>` CLI command so registry mutation and validation remain centralized.
- Display rename errors inline/transiently without crashing the TUI.
- Update footer shortcut text to include `r rename`.

## Non-Goals

- Do not rename arbitrary agents from the console; rename operates on the selected agent.
- Do not duplicate `agent rename` registry mutation logic in TUI code.
- Do not rename tmux sessions; CLI rename remains registry-only.
- Do not immediately refresh the console after a successful rename. The user explicitly accepted waiting for the next polling refresh.
- Do not add bulk rename support or a separate historical-session rename feature.

## User Stories & Use Cases

- As a developer using `agent console`, I want to press `r` on the selected agent and edit its name so I can label it without leaving the console.
- As a developer, I want the current name prefilled so small edits are fast and less error-prone.
- As a developer, if the new name is invalid or already used, I want the console to show the CLI error and keep me in rename mode for correction.
- As a developer, I want to cancel rename and return to the normal preview/chat workspace without side effects.

## Success Criteria

- Pressing `r` with a selected agent switches the content workspace into rename mode.
- Rename mode shows the selected agent's current name and an editable new-name field prefilled with that name.
- Submitting a changed name invokes `runAction({ type: 'rename', currentName, newName })`, mapped to `agent rename <currentName> <newName>`.
- Cancel returns to the default preview/chat workspace without invoking the action.
- Failed rename keeps rename mode active and shows actionable error output.
- Successful rename returns to the default preview/chat workspace and relies on the existing polling loop for the renamed agent to appear.
- Existing console shortcuts (`j`, `k`, `o`, `i`, `m`, `s`, `K`, `q`) remain stable.
- Footer documents `r rename`.

## Constraints & Assumptions

- Current checkout: `main`; user explicitly requested no worktree, so branch/workspace isolation is reduced.
- Existing unrelated dirty file: `BACKLOG.md`; this feature should not modify or revert it.
- `agent rename` already owns validation, no-op handling, registry conflict checks, stale-entry pruning, and atomic writes.
- The console is an Ink TUI; rename should use existing Ink components and not an external prompt.
- Existing console actions are subprocess-based through `runAction`; rename follows that pattern.
- No immediate refresh after success by user decision. The next scheduled `useAgentList` poll will update visible names.
- Dependency bootstrap used root `npm ci`. It exited successfully, but `husky` could not write `.git/config` in the sandbox.

## Alternatives Considered

- Inline one-key prompt in the footer: compact, but poor editing/error ergonomics and inconsistent with the start workspace.
- External CLI prompt after pausing Ink: simpler, but interrupts the console model and risks terminal rendering artifacts.
- Right-pane rename workspace: recommended and accepted. It matches the console start pattern, supports inline errors, and keeps CLI rename as the source of truth.

## Questions & Open Items

All material questions resolved.

## Phase 2 Requirements Review

Reviewed on 2026-06-02 against the requirements template, existing `agent rename` docs, console start/kill patterns, and stored memory. Problem statement, goals, non-goals, user stories, success criteria, constraints, alternatives, and open questions are complete and internally consistent.

Validated decisions:

- Use lowercase `r` for selected-agent rename in `agent console`.
- Use a native right-pane workspace, not an external prompt or footer-only input.
- Submit through existing `agent rename <current> <new>` behavior.
- Do not call an immediate console refresh after successful rename; wait for normal polling.
- Continue on `main` without a worktree or feature branch per user instruction.

No remaining material open questions.
