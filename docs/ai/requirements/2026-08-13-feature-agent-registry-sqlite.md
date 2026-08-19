---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

`ai-devkit agent start --name <custom>` can create a correctly named tmux session while `ai-devkit agent list` later shows a generated fallback name such as `ai-devkit-77725`. Controlled reproduction on 2026-08-13 showed two related defects in the JSON registry at `~/.ai-devkit/agents.json`:

- `AgentManager.listAgents()` can write an adapter-generated fallback entry for a live process before or concurrently with `agent start` writing the user-provided name.
- `AgentRegistry.registerBatch()` upserts by `name` only, so the same live process can have duplicate rows with the same `pid` and different names.
- Multiple commands write through the fixed temp path `agents.json.tmp`, so concurrent `agent start`, `agent list`, `agent detail`, or `agent console` writes can fail with `ENOENT` during `rename()`.

Affected users are developers supervising local agents through `agent list`, `agent send`, `agent detail`, `agent kill`, and `agent console`. The current workaround is manual registry cleanup or renaming, which is fragile because polling commands can reintroduce generated rows.

## Goals & Objectives

- Preserve user-provided agent names and tmux session metadata across repeated list/detail/console polling.
- Prevent duplicate live registry entries for the same agent process identity.
- Make registry writes robust under concurrent short-lived CLI commands and long-running console polling.
- Keep existing public `AgentRegistry` API callers working with minimal call-site churn.
- Ignore existing `agents.json` state and let live discovery/start registration repopulate SQLite, avoiding stale-row resurrection.

Non-goals:

- Do not redesign provider detection or session parsing.
- Do not move historical provider session indexes into this registry.
- Do not change print-mode agent storage in `durable-agents.json`.
- Do not add a daemon or long-running registry service.

## User Stories & Use Cases

- As a developer, I want `agent list` to keep showing `agent-list-debug` after I start an agent with that name, so I can target it reliably with `agent send --id agent-list-debug`.
- As a developer using `agent console`, I want background polling not to overwrite custom names with generated fallback names.
- As a developer running multiple CLI commands, I want registry writes not to fail when commands overlap.
- As a maintainer, I want the registry to enforce one live row per process identity so bugs are caught by storage constraints rather than display ordering.
- As an existing user, I want stale `agents.json` rows not to reappear after the SQLite registry is initialized.

## Success Criteria

- `AgentRegistry` stores live agents in SQLite at `~/.ai-devkit/agents.db`.
- Repeated or concurrent registration for the same `type + pid` keeps one row.
- A non-empty existing custom `name` and `tmuxSession` are preserved when incoming detection has only a generated fallback name and empty tmux metadata.
- `agent start --name <custom>` followed by repeated `agent list`, `agent detail`, and `agent console` polling continues to list `<custom>`.
- Concurrent registry writes do not use a shared temp file and do not fail with `agents.json.tmp` rename errors.
- Existing `agents.json` entries are left in place but not imported into SQLite.
- Existing tests for start/list/rename/kill/session cache pass, with new regression tests for duplicate PID/name preservation and concurrent writes.

## Constraints & Assumptions

- `@ai-devkit/agent-manager` already depends on `better-sqlite3`, so no new runtime storage dependency is required.
- CLI commands are local-only and synchronous registry operations are acceptable.
- The registry is process-local user data under `~/.ai-devkit`; no network or multi-user access is required.
- Live process identity is primarily `type + pid`; `sessionId` and `sessionFilePath` are metadata and may be empty early in startup.
- Generated names follow the adapter pattern `<project-folder>-<pid>` and should not replace a user-managed name when the same process already has one.

## Questions & Open Items

- Naming policy: preserve any existing name for a same `type + pid` row unless callers explicitly invoke `rename()` or `startAgent()` registers a managed name. Accepted assumption for this feature.
- Legacy cleanup: keep `agents.json` rather than deleting or rewriting it, but do not import it. Accepted assumption for rollback safety and stale-row prevention.
