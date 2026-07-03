---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement
**What problem are we solving?**

- Users can supervise running agents in `ai-devkit agent console`, but they cannot inspect AI DevKit memory from the same TUI.
- Users who want project recall while supervising or messaging agents must leave the console and run `ai-devkit memory search` or open `ai-devkit memory-dashboard`.
- This context switch makes memory less visible during everyday agent supervision, especially when users want to quickly see recent project decisions, conventions, or fixes before messaging an agent.

## Goals & Objectives
**What do we want to achieve?**

- Primary goals:
  - Add a keyboard-accessible, read-only memory list inside `ai-devkit agent console`.
  - Let users view recent memory items without leaving the console or interrupting agent list polling.
  - Reuse the existing AI DevKit memory database path resolution and `@ai-devkit/memory` read APIs.
  - Keep the console interaction model consistent with existing right-pane workspaces such as help, start agent, rename, and channel selection.
- Secondary goals:
  - Show useful metadata for each item: title, scope, tags, and updated time.
  - Support an empty state and error state that explain what happened without crashing the TUI.
  - Document the shortcut in the help pane and footer hints.
- Non-goals:
  - Creating, editing, deleting, merging, or storing memory from the console.
  - Replacing `ai-devkit memory search`, `ai-devkit memory-dashboard`, or the browser graph UI.
  - Full-text search UX in the first slice unless it falls out naturally from the read-only list implementation.
  - Cross-project memory synchronization or remote memory access.

## User Stories & Use Cases
**How will users interact with the solution?**

- As a user supervising local agents, I want to open a memory list in the agent console so that I can recall project knowledge before messaging or directing an agent.
- As a user in a narrow terminal, I want the memory view to follow the console's existing narrow-layout replacement-pane behavior so that it remains readable.
- As a user with no stored memory, I want a clear empty state so that I know the feature is working and there is simply no data to show.
- As a user with a configured project memory path, I want the console to use the same memory database as `ai-devkit memory ...` commands so that the displayed items match CLI behavior.
- Key workflow:
  - User runs `ai-devkit agent console`.
  - User presses a new shortcut from the list/preview focus state.
  - The right pane changes to a memory list.
  - User scans recent memory items and presses the shortcut again or a back key to return to preview.
- Edge cases:
  - Memory database does not exist yet.
  - Memory database exists but has zero items.
  - Configured memory database path is invalid or unreadable.
  - Memory item titles, tags, or scopes are longer than the available terminal width.
  - Agent console is already focused on chat input or another modal/workspace.

## Success Criteria
**How will we know when we're done?**

- `ai-devkit agent console` exposes a documented shortcut for opening a read-only memory list.
- The memory list renders recent memory items from the configured memory database using existing memory package APIs, not direct SQLite reads in the TUI.
- The memory list can be opened and closed without disrupting agent polling, selection, chat input behavior, channel controls, start/rename panes, kill confirmation, or help.
- Empty and error states are covered and understandable.
- Unit tests cover shortcut routing, right-pane mode selection, memory pane rendering, empty/error states, and help/footer hint updates.
- Existing console tests continue to pass.

## Constraints & Assumptions
**What limitations do we need to work within?**

- Technical constraints:
  - The console is an Ink TUI in `packages/cli/src/tui/console`.
  - The memory database path is resolved by CLI config code; the feature should avoid duplicating config resolution rules.
  - Memory content is local developer data and should remain read-only in the console for this feature.
  - Keyboard handling must not steal input while the chat input or another pane owns focus.
- Assumptions:
  - A default recent-items list is the right first console view because it answers "what do I know already?" with the fewest controls.
  - A read-only console view is lower risk than adding mutation flows.
  - The first implementation can cap results to a small number, such as 20, to preserve TUI responsiveness.

## Questions & Open Items
**What do we still need to clarify?**

- Requirements review decisions:
  - Shortcut: use uppercase `M` to open/close the memory list. Lowercase `m` remains mapped to message input.
  - List ordering: show recent memory first using `updated-desc`.
  - Search/filter controls: defer interactive search and filtering to a follow-up feature. This feature only needs a bounded recent list.
  - Content preview: show title and metadata only in the initial list. Full-content detail is deferred unless implementation discovers the list is unusable without a compact detail preview.
- No unresolved material requirements questions remain for the first read-only memory-list slice.
