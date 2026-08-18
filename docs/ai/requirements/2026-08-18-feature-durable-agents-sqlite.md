---
phase: requirements
title: Durable Agents SQLite Requirements
description: Persist durable print agents in the shared agents.db database
---

# Durable Agents SQLite Requirements

## Problem Statement

Durable print-agent state currently lives in `~/.ai-devkit/print-agents.json` and relies on hand-rolled filesystem locks, atomic file replacement, and per-agent lock directories. This storage is harder to make transactional and concurrent than the existing SQLite agent registry. Users need durable sessions to survive process exits and concurrent CLI access without being exposed to partial writes or stale lock artifacts.

## Goals & Objectives

- Store durable agents in a separate `durable_agents` table in `~/.ai-devkit/agents.db`.
- Preserve the exported `PrintAgentStore` API and all service, runner, and CLI call sites.
- Import a valid legacy version-1 JSON file exactly once on the first writable open.
- Replace all filesystem locking and whole-file writes with short SQLite transactions and token-based compare-and-swap updates.
- Make readonly database connections genuinely write-free and keep readonly listing pure.
- Preserve current identity, cwd safety, ownership, recovery, reconciliation, and session-resume behavior.

### Non-goals

- Renaming print-domain types or APIs to durable-agent names.
- Merging durable agents into the process registry `agents` table.
- Adding run history or a `durable_runs` table.
- Dual-writing JSON and SQLite, or supporting automatic rollback to JSON.
- Resolving cross-provider/cross-mode name ambiguity beyond existing CLI behavior.

## User Stories & Use Cases

- As a CLI user, I can create, list, acquire, resume, and complete a durable agent with unchanged commands.
- As an upgrading user, my valid legacy agents are imported atomically and the JSON file is retained as a clearly named backup.
- As a concurrent caller, only one process can acquire a durable agent and stale observations cannot steal ownership.
- As a readonly caller, I can list an already-migrated database without creating directories, changing pragmas, migrating, or reconciling runs.
- As an operator, I receive domain errors for name conflicts, busy agents, invalid ownership, malformed migration input, and corrupt databases.

## Success Criteria

- Migration `003_durable_agents.sql` creates the specified flattened table, constraints, and indexes and advances `user_version`.
- `PrintAgentStore` accepts `dbPath`; `filePath` remains accepted for one compatibility release and maps test JSON paths to the corresponding `agents.db` path.
- Deprecated lock timing options remain accepted but unused and are documented.
- Import is atomic, marked in SQLite, idempotent, rejects unsafe or invalid JSON without partial data, and renames successful input to `.migrated-v1.bak` only after commit.
- Create, acquire, provider recording, completion, and reconciliation use SQLite writes; ownership-changing writes use `(id, token)` or observed stale identity CAS predicates.
- `list()` on readonly connections never reconciles.
- The full behavioral and new validation matrix passes, followed by workspace test, lint, typecheck, and build gates.

## Constraints & Assumptions

- Existing WAL and `busy_timeout=5000` settings remain authoritative for writable connections.
- Provider remains application-validated with no schema `CHECK`, allowing provider additions without migration.
- Running rows have all active fields populated; non-running rows have none.
- A live owner or live provider keeps a run busy; stale detection includes PID start time to prevent PID-reuse errors.
- Result summaries remain capped at 4,096 characters.
- Migration is one-way. Rollback requires export; older binaries must not write JSON after migration.
- Open print-provider PRs are coordination risks only; migration numbering is reconciled during final rebase if necessary.

## Questions & Open Items

None. Product, schema, migration, concurrency, rollout, compatibility, and validation decisions are binding in the approved feature brief.
