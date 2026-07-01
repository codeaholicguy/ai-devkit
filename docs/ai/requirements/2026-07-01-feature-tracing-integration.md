---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

When running ai-devkit workflows (`dev-lifecycle`, `structured-debug`), there is no
single place answering "where are we right now?" — current phase, progress, blockers,
last validation, next step, and which agent owns it. Every `dev-lifecycle` run
re-derives state from scratch, and nothing persists *operational* progress across
runs or across agents.

The durable unit is now a **Task** (locked contract from `task-system-feature`).
Tracing is **task progress/events**, not a separate session-trace model.

## Goals & Objectives

- **Primary:** Provide a tracing integration layer that maps dev-lifecycle /
  structured-debug progress semantics onto the Task contract: phase, progress,
  next step, blockers, validation evidence, agent attribution.
- **Secondary:** A read surface (`status digest`) for orchestrator/parent agents
  to route work and hand off.
- **Non-goals:** Building task storage (owned by `task-system-feature`);
  duplicating the Task contract; a separate session-trace store; project-management
  features (assignees/priority/dependencies); a `task` CLI command (owned upstream);
  structured-debug-specific event vocabulary (reuses generic events in MVP).

## User Stories

- As a `dev-lifecycle` agent, on phase transition I record the new phase on the
  feature's task so resume shows "implementation, since T".
- As a `verify`/`tdd` agent, after fresh evidence I record a validation result so
  "last validation" is trustworthy and timestamped.
- As an orchestrator/parent agent, I read a feature's status digest to decide what
  to route next and whether evidence is stale.
- As any phase agent discovering a blocker, I raise it; resolving it clears it.

## Success Criteria

- Tracing semantics map 1:1 onto the locked Task contract event types (no new types).
- The layer never writes `~/.ai-devkit/tasks/<id>/` directly — it consumes a
  `TaskService` port only.
- Unit tests cover the semantic→contract mapping and CLI argv construction with an
  in-memory fake `TaskService`; build + typecheck + tests pass (fresh evidence).
- The layer is storage-agnostic: swapping the in-memory fake for the real
  `TaskService` requires no change to mapping logic.

## Constraints & Assumptions

- **Constraint (locked contract):** one task per feature; `phase` is a single
  first-class field. Event-type strings, CLI verbs, and service API are FROZEN.
- **Constraint (no upstream code yet):** `task-system-feature` has locked the
  contract *document* but not shipped `TaskService`/`task` CLI. We build against the
  contract as a **port** (dependency inversion); the real service plugs in later.
- **Assumption:** task IDs are opaque strings (exact or unique-prefix match).
- **Assumption:** `phase` is free-form string; never assert on the enum.

## Questions & Open Items

- None blocking. Will re-sync if shipped `TaskService` type names diverge from the
  contract document.
