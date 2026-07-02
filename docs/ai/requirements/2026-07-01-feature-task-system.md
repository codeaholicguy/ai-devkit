---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding — Task System

## Problem Statement
**What problem are we solving?**

AI coding agents (and the humans steering them) work on features and bugs that span many
steps: requirements, design, code, tests, review, verification. Today each step's context
lives in scattered places — agent transcripts, shell history, memory entries, chat threads —
with no single durable record that ties a unit of work to its artifacts, evidence, progress,
blockers, current lifecycle phase, ownership, and branch/PR links.

- **Who is affected:** AI agents running the dev-lifecycle (requirements → review), the
  `verify` skill needing a place to record evidence, multi-agent setups attributing work, and
  humans reviewing what happened on a task.
- **Current situation/workaround:** Work state is implicit. `memory` stores reusable
  knowledge but not per-task progress. `agent-manager` tracks running processes, not work
  units. There is no durable, queryable task record.

## Goals & Objectives
**What do we want to achieve?**

- **Primary goals**
  - Introduce a **task** as the durable unit for development/debug work with a **stable task
    identifier**.
  - Encapsulate per task: **artifacts, evidence, progress, blockers, workflow phase,
    ownership/agent attribution, branch/worktree/PR links**, and an **append-only event
    history**.
  - SQLite storage at `~/.ai-devkit/tasks.db` (snapshot table + append-only events table).
  - Provide a service API over the concrete SQLite task repository so callers do not touch
    database details.
  - CLI UX for create/list/show/update and for adding evidence/progress/blockers/artifacts.
- **Secondary goals**
  - Practical integration points for `dev-lifecycle` (phase transitions) and `verify`
    (evidence recording).
  - A stable **event model** for tracking progress and evidence.
- **Non-goals (explicitly out of scope)**
  - Project management: no sprints, milestones, boards, Gantt, multi-project hierarchies,
    permissions, or user accounts.
  - Full event-sourced rebuild of snapshots from history (events are an append-only audit
    trail; snapshot is authoritative for MVP — replay is a documented future capability).
  - Concurrent multi-writer locking / networked multi-user sync (single-user local tool).
  - A TUI/dashboard for tasks in this MVP.
  - Auto-replacing the memory or agent-manager subsystems.

## User Stories & Use Cases
**How will users interact with the solution?**

- As an **agent running dev-lifecycle**, I want to create a task when starting a feature so
  every subsequent phase, artifact, and decision is anchored to one stable id.
- As an **agent**, I want to advance a task's phase (`requirements` → … → `review`) so the
  workflow state is queryable.
- As the **verify** skill, I want to append **evidence** (claim + command/output + pass/fail)
  to a task so completion claims are auditable.
- As an **agent**, I want to record **progress** notes and raise/resolve **blockers** so
  handoffs between sessions/agents are lossless.
- As a **multi-agent setup**, I want to attribute work (assignees/owner/actor) and link a
  branch/worktree/PR so ownership is clear.
- As a **human reviewer**, I want `task show <id>` (and `--events`) to reconstruct what
  happened on a task.

Edge cases: unknown/short task id lookups, missing task, corrupt snapshot JSON,
duplicate ids (negligible with UUIDs), appending to a task whose snapshot was hand-edited.

## Success Criteria
**How will we know when we're done?**

- A task can be created, listed, shown, updated, advanced through phases, and have
  artifacts/evidence/progress/blockers added — all via CLI with `--json` machine output.
- Every mutation appends an event to the event history **and** updates the task snapshot.
- `TaskService` keeps callers and the CLI separated from SQLite details; only the task-manager
  repository layer reads and writes the database.
- Stable task ids survive renames/updates and are globally unique (raw UUIDs); creation
  order is tracked by the indexed `created_at` column, not the id.
- Unit + integration tests pass; `nx test`, `nx build`, `nx lint` are green for the new
  package and the CLI.

## Constraints & Assumptions
**What limitations do we need to work within?**

- **Technical constraints**
  - Node `>=20.20.0`, ESM, TypeScript strict (match existing packages).
  - Monorepo + nx + swc build; mirror the `@ai-devkit/memory` package shape.
  - SQLite (`better-sqlite3`) must be portable across agents sharing `~/.ai-devkit/tasks.db`.
- **Assumptions**
  - Single-writer at a time per task (no fs-level locking for MVP).
  - `~/.ai-devkit/` is the shared home data dir (already used by `agent-manager`,
    `channel-connector`).
  - Task ids are generated once at creation and **never** change.
- **MVP decisions:**
  1. **Task id format:** raw UUIDv4 (`crypto.randomUUID()`), stored as TEXT —
     stable, human-readable, globally unique with no collision checks or coordination.
  2. **Storage model:** SQLite at `~/.ai-devkit/tasks.db`; snapshot (in the `tasks` table)
     authoritative for reads; `task_events` table append-only audit trail; atomic per-statement
     writes; WAL + `busy_timeout` for concurrency.
  3. **Event model:** stateful event types mutate the snapshot; a generic `task.custom` event
     type is reserved for tracing/observability and does **not** mutate the snapshot.
  4. **New package/plugin** `@ai-devkit/task-manager` mirrors `@ai-devkit/memory` for the
     library layer and exposes `ai-devkit task ...` through the AI DevKit plugin manifest.
  5. **Default DB path** `~/.ai-devkit/tasks.db`; project CLI usage can set
     `.ai-devkit.json` `tasks.path`, with `--db-path` as an explicit command override.

## Questions & Open Items
**What do we still need to clarify?**

None blocking. The MVP boundary above was set from the directive. Deferred to later phases:
event-sourced snapshot rebuild, concurrency locking, task TUI.
