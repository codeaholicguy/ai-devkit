---
phase: requirements
title: Concurrency-safe WAL setup
description: Prevent SQLITE_BUSY while concurrent processes open shared AI DevKit databases
---

# Concurrency-safe WAL setup

## Problem

Concurrent cold opens of the memory, agent-manager, and task-manager SQLite databases can fail immediately with `SQLITE_BUSY`. Each connection currently requests WAL before arming its busy handler, forcing every opener through SQLite's journal-mode transition lock path.

## Goals and success criteria

- Arm a 5000 ms SQLite busy timeout when each connection is constructed.
- Read the current journal mode and request WAL only when it differs from `wal`.
- Retry the complete pragma configuration once after about 50 ms when it raises `SQLITE_BUSY`.
- Apply identical behavior to all three database connection classes.
- Prove concurrent fresh shared-file opens, already-WAL opens, and readonly already-WAL opens do not fail or repeat the mode transition.

## Constraints and non-goals

- WAL remains enforced for writable databases whose mode differs.
- Keep `foreign_keys`, `synchronous = NORMAL`, `busy_timeout`, and `mmap_size` unchanged.
- No schema/data migration or public API change.
- No broader SQLite policy changes.

## Open items

None. The reported root cause, fix shape, and validation gates are explicit.
