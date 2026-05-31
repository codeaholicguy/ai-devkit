---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

Running agents accumulate auto-generated names like `my-project-1748700000` that are hard to recall. There is currently no way to assign a more meaningful name to a running agent after it has been started. Users must stop and restart the agent with a new `--name` to rename it, losing context.

Affected users: CLI users who manage multiple long-lived agents via `agent list`, `agent send`, `agent open`.

## Goals & Objectives

**Primary goal:** Allow a user to rename a registered agent by running `agent rename <current-name> <new-name>`.

**Non-goals:**
- Renaming the underlying tmux session (registry-only change, per decision)
- Renaming an agent that is not in the registry (stale/unknown agents are out of scope)
- Bulk rename or pattern-based rename

## User Stories & Use Cases

- As a CLI user, I want to run `agent rename my-project-1abc2d my-api-agent` so the agent shows a readable name in `agent list` and I can reference it easily with `agent send --id my-api-agent`.
- As a CLI user, if I supply a `<new-name>` that is already in use, I want a clear error telling me the conflict.
- As a CLI user, if I supply a `<current-name>` not in the registry, I want a clear error.
- As a CLI user, if I supply an invalid `<new-name>` format, I want a validation error with the format rules.

**Edge cases:**
- Current name and new name are the same → no-op success or informational message.
- New name exists but the entry is stale (process dead) → prune first, then allow rename.

## Success Criteria

- `agent rename <current> <new>` updates `name` in `~/.ai-devkit/agents.json` atomically.
- The renamed agent appears under the new name in `agent list`.
- `agent send --id <new-name>` and `agent open <new-name>` resolve correctly after rename.
- All error paths (not found, conflict, invalid format) produce actionable messages and exit code 1.
- Existing unit tests for `AgentRegistry` pass; new tests cover `rename()`.

## Constraints & Assumptions

- Name format: `/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/` (existing `NAME_REGEX` in `agent.ts`).
- Registry file: `~/.ai-devkit/agents.json` (atomic write via `.tmp` + `rename`).
- The tmux session name is NOT updated — `tmuxSession` field in the entry retains its original value.
- No distributed locking; single-writer pattern is already established.

## Questions & Open Items

All material questions resolved. No open items.
