---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

The agent console preview updates conversation content by polling, but gives no continuous visual signal while the selected agent is running. Console users can mistake an unchanged preview for a stalled agent and must infer activity from the compact list status.

## Goals & Objectives
**What do we want to achieve?**

- Show a quiet, terminal-native activity animation at the bottom of the visible preview for the currently selected `RUNNING` agent.
- Keep animation renders isolated from Markdown layout and preserve preview scrolling.
- Reclaim the activity row for conversation content whenever the indicator is inactive.
- Provide a narrow ASCII fallback for `TERM=dumb` terminals.
- Non-goals: token streaming, status freshness changes, durable-agent activity mapping, an explicit ASCII capability setting, and reduced-motion configuration.

## User Stories & Use Cases
**How will users interact with the solution?**

- As a console user, I want the preview to show `working` while its selected agent is running so that I can tell the console is still observing active work.
- The indicator appears only for `AgentStatus.RUNNING`; `WAITING`, `IDLE`, `UNKNOWN`, and no selection show no activity row.
- Pinning has no effect on activity semantics.
- Animation continues when list/conversation polling is paused by text input because it reflects the last observed status.
- A status transition or unmount stops the timer immediately, without changing conversation scroll state.

## Success Criteria
**How will we know when we're done?**

- Unicode terminals cycle `⠋⠙⠹⠸⠼⠴⠦⠧` every 160 ms beside lowercase `working`.
- `TERM=dumb` cycles fixed-width `|/-\\` frames at the same cadence.
- The row consumes exactly one preview line while active and disappears cleanly when inactive.
- Only the leaf indicator re-renders for animation frames; Markdown rows and the parent preview do not re-render or reparse.
- Frame ticks do not clamp/reset scrolling or interfere with poll-driven content updates.
- Fake-timer Ink tests cover cycling, cleanup, status transitions, fallback, render isolation, and scroll/content stability; pure frame logic has 100% coverage.
- Documentation, changelog, build, full workspace tests, lint, and typecheck are complete.

## Constraints & Assumptions
**What limitations do we need to work within?**

- Ink 7 and the existing console test utilities are used; no new runtime dependency is introduced.
- The timer is component-local and never stored in context, `ConsoleApp`, `PreviewSection`, or `PreviewPane` state.
- Unicode is first-class; only `TERM=dumb` selects ASCII in this release.
- `RUNNING` is the last status observed by polling, not proof of recent token output.
- The approved Option C exploration and its five decisions are binding.

## Questions & Open Items
**What do we still need to clarify?**

- None. Copy, geometry, cadence, fallback, and paused-polling behavior were approved before implementation.
