---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Agent Name Filter Implementation

## Development Setup
**How do we get started?**

- Use the repository Node/npm workspace with existing dependencies.
- Run focused Vitest from the repository root and CLI lint/build through the package scripts.
- No configuration, migration, or new dependency is required.

## Code Structure
**How is the code organized?**

- `packages/cli/src/tui/console/filter/agentFilter.ts`: pure name-filter operations.
- `packages/cli/src/__tests__/tui/console/filter/agentFilter.test.ts`: behavior and coverage contract.
- `packages/cli/src/tui/console/ConsoleApp.tsx`: owns query/focus state, derives the visible ordered array, keeps selection coherent, routes navigation, and drives immediate refresh on clear.
- `packages/cli/src/tui/console/AgentListPane.tsx`: renders inline editing/confirmed state, counts, no-match messaging, highlights, remote markers, and clamped filtered scrolling.
- `packages/cli/src/tui/console/state/ConsoleContext.tsx`: pauses agent and channel polling for message entry or a filter session.
- `packages/cli/src/tui/console/HelpPane.tsx` and `StatusFooter.tsx`: advertise `/ filter` normally and `Esc clear filter` during a session.

## Implementation Notes
**Key technical details to remember:**

### Core Features

- Task 1.1: case-insensitive substring matching uses plain `toLowerCase()`, returns every non-overlapping occurrence range, preserves arbitrary input order, and returns the original array for an empty query.
- Task 1.2: `ConsoleFocus` includes `'filter'`; the pure router opens only from an unfiltered list, clears only an active list filter on Esc, treats confirmed `/` as a no-op, and leaves filter-focus keystrokes to the controlled input.
- Task 2.1: the shell derives `visibleAgents` with `filterAgents`, uses it for selection and navigation, pauses both polling subscriptions while editing or applied, and clears with an immediate `refresh()`.
- Task 2.2: the list renders `(matched/total)`, a live `TextInput`, a confirmed indicator, all visible match spans in bold, filtered empty state, channel markers, and scroll clamping based on the filtered length.
- Task 2.3: help includes `/` and the footer suppresses command hints in favor of `Esc clear filter` for the whole session.

### Patterns & Best Practices
- Keep matching pure and dependency-free.
- Treat the received agent order as authoritative; never sort or partition.
- Drive each behavior through a failing focused test before production code.

## Integration Points
**How do pieces connect?**

- The filter module consumes `AgentInfo[]`; `ConsoleAppShell` composes it over the received order without sorting or pin-specific logic.
- Selection and navigation share `visibleAgents`; preview resolution continues through the selected name against the frozen source snapshot.
- No database, external API, or third-party integration is involved.

## Error Handling
**How do we handle failures?**

- No exceptions or logging are introduced. A non-match is represented as `null` positions or an omitted agent.

## Performance Considerations
**How do we keep it fast?**

- Matching is linear over the received array and names. Empty query avoids allocation by returning the input array.

## Security Notes
**What security measures are in place?**

- Query text is ephemeral local UI state and is not executed or persisted. No authentication, encryption, or secret handling changes.

## Validation

- Focused integration/unit suite: 6 files, 35 tests passed.
- Pure filter coverage: 100% statements, branches, functions, and lines.
- Key-routing coverage: 100% statements, branches, functions, and lines.
- CLI suite: 83 files, 1001 tests passed.
- CLI lint: exit 0 with five pre-existing unused-catch warnings outside this feature.
- CLI build: SWC and TypeScript declaration generation completed successfully.
- Feature docs lint: all configured docs and worktree checks passed.
