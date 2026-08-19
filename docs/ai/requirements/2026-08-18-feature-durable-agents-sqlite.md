---
phase: requirements
title: Durable Agents SQLite Requirements
description: Persist durable durable agents in the shared agents.db database
---

# Durable Agents SQLite Requirements

## Problem Statement

Durable durable-agent persistence is a new, unreleased capability. It should launch directly on the existing SQLite agent database so durable sessions survive process exits and concurrent CLI access without introducing a separate JSON store or filesystem lock machinery.

## Goals & Objectives

- Store durable agents in a separate `durable_agents` table in `~/.ai-devkit/agents.db`.
- Preserve the exported `DurableAgentStore` API and all service, runner, and CLI call sites.
- Replace all filesystem locking and whole-file writes with short SQLite transactions and token-based compare-and-swap updates.
- Make readonly database connections genuinely write-free and keep readonly listing pure.
- Preserve current identity, cwd safety, ownership, recovery, reconciliation, and session-resume behavior.

### Non-goals

- Renaming print-domain types or APIs to durable-agent names.
- Merging durable agents into the process registry `agents` table.
- Adding run history or a `durable_runs` table.
- Supporting legacy JSON import or dual-write; `durable-agents.json` was never released to users.
- Resolving cross-provider/cross-mode name ambiguity beyond existing CLI behavior.

## User Stories & Use Cases

- As a CLI user, I can create, list, acquire, resume, and complete a durable agent with unchanged commands.
- As a concurrent caller, only one process can acquire a durable agent and stale observations cannot steal ownership.
- As a readonly caller, I can list an already-migrated database without creating directories, changing pragmas, migrating, or reconciling runs.
- As an operator, I receive domain errors for name conflicts, busy agents, invalid ownership, and corrupt databases.

## Success Criteria

- Migration `003_durable_agents.sql` creates the specified flattened table, constraints, and indexes and advances `user_version`.
- `DurableAgentStore` accepts `dbPath` and defaults directly to `~/.ai-devkit/agents.db`.
- Deprecated lock timing options remain accepted but unused and are documented.
- Create, acquire, provider recording, completion, and reconciliation use SQLite writes; ownership-changing writes use `(id, token)` or observed stale identity CAS predicates.
- `list()` on readonly connections never reconciles.
- The full behavioral and new validation matrix passes, followed by workspace test, lint, typecheck, and build gates.

## Constraints & Assumptions

- Existing WAL and `busy_timeout=5000` settings remain authoritative for writable connections.
- Provider remains application-validated with no schema `CHECK`, allowing provider additions without migration.
- Running rows have all active fields populated; non-running rows have none.
- A live owner or live provider keeps a run busy; stale detection includes PID start time to prevent PID-reuse errors.
- Result summaries remain capped at 4,096 characters.
- Open print-provider PRs are coordination risks only; migration numbering is reconciled during final rebase if necessary.

## Questions & Open Items

None. Product, schema, concurrency, rollout, and validation decisions reflect the approved unreleased-feature scope.
