---
phase: requirements
title: Agent Name Filter Requirements
description: Inline name filtering for the console agent list
---

# Agent Name Filter Requirements

## Problem Statement

Operators with many running agents must currently move through the console agent list one row at a time. They need a predictable keyboard-first way to narrow the existing ordered list by agent name without disrupting selection, preview coherence, or live text entry.

## Goals & Objectives

- Add a vim-style `/` inline name filter to the agent list.
- Live-filter by case-insensitive substring while preserving the input array order.
- Keep selection, scrolling, preview, channel markers, and list counts coherent with the visible result.
- Pause polling for the entire filter session so the snapshot does not shift under the operator.
- Make the matcher and routing behavior independently testable with 100% coverage.

Non-goals:

- Fuzzy, subsequence, prefix-only, ranked, status, type, project, or pin-aware filtering.
- New dependencies, subprocess search, locale-aware grapheme matching, or persistence across console launches.
- Changing the ordering or partition semantics supplied by the agent source.

## User Stories & Use Cases

- As an operator in list focus, I press `/` with no active filter to edit a name query inline.
- As an operator editing a query, every printable key—including `/`, `j`, `k`, `v`, `i`, `m`, and `q`—is literal text and never a console command.
- As an operator, I press Enter to confirm the current query and browse the frozen filtered snapshot.
- As an operator, I press Esc while editing or with a confirmed filter to clear it, retain the current selection when possible, resume polling, and refresh immediately.
- As an operator, I see `(matched/total)`, bold matching name substrings, an active-filter indicator after confirmation, and `No agents match "query"` for an empty result.
- As an operator, pressing `/` with a confirmed filter is a no-op; I clear with Esc before starting another query.

## Success Criteria

- Matching uses exactly `name.toLowerCase().includes(query.toLowerCase())`; empty query returns the original array by identity and matching preserves source order.
- Match positions support bolding every non-overlapping occurrence and cover basic Unicode case folding such as `Ä`/`ä`.
- Filtering out the selected agent selects the first visible agent; no matches select `null`; clearing preserves the current selection if it exists in the full list.
- Navigation, preview lookup, scroll bounds, and more indicators use the filtered array. Narrowing and widening never leave a stale scroll offset.
- The input is rendered under `AGENTS` with placeholder `Filter by name…`; confirmed state displays an indicator and `(matched/total)` is correct.
- Existing error precedence remains: an error with an empty source list wins over the filter-empty state. Remote channel markers remain intact.
- Polling is paused while editing or while a non-empty filter is applied. Esc-clear resumes polling and triggers an immediate refresh.
- Existing detail, message input, modal pane, shortcut, and Esc behavior is unchanged outside the filter session.
- Targeted and full CLI tests pass; all new pure filter logic and routing branches have 100% coverage.

## Constraints & Assumptions

- State belongs in `ConsoleAppShell`, because routing, navigation, selection, preview, footer hints, and polling all depend on it.
- A filter session is active while the editor is open or a non-empty query is applied. An empty confirmed query is equivalent to no active filter.
- `toLowerCase()` code-point folding is sufficient for the MVP.
- The feature consumes whatever ordered `AgentInfo[]` it receives and contains zero pin-specific sorting or partition logic.
- Existing `ink-text-input` patterns and repository test tooling are reused; no dependencies are added.
- Query text may exceed pane width; the established input clipping/scrolling behavior is acceptable.

## Questions & Open Items

None. Matcher, key bindings, selection, polling, rendering, Unicode scope, and parallel pin composition are binding user decisions.

## Requirements Review

Reviewed 2026-08-16 against the requirements template and verified console architecture. The problem, users, goals, non-goals, workflows, measurable acceptance criteria, constraints, validation, and rollout scope are complete. Alternatives considered were inline, modal, and always-on filtering; inline `/` is accepted because it preserves incremental list context while providing an explicit text-entry boundary. No material gaps or open questions remain.
