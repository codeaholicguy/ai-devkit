---
phase: requirements
title: Agent Groups
description: Create, update, remove, list, and send messages to named groups of running agents
---

# Agent Groups

## Problem Statement

Developers using `ai-devkit agent send` can target one running agent at a time with `--id`, but common multi-agent workflows require sending the same instruction to several agents. Today the user must repeat the same command for every target agent, keep a separate note of which agent names belong together, and manually handle partial failures.

Affected users are developers coordinating multiple Codex, Claude Code, Gemini CLI, OpenCode, Copilot, or Pi sessions from the CLI or TUI-adjacent scripts.

The current workaround is shell scripting around repeated `agent send --id <agent>` invocations. That duplicates target lists, makes reuse awkward, and gives each user a different failure-handling behavior.

## Goals & Objectives

Primary goals:

- Let users create named agent groups that contain multiple agent identifiers.
- Let users update a group by replacing, adding, or removing members.
- Let users remove groups when they are no longer useful.
- Let users list configured groups and inspect their members.
- Add `agent send --group <name>` so one prompt is delivered to every currently resolvable member in the group.
- Preserve existing single-target `agent send --id <agent>` behavior.
- Store groups locally in the same user-scoped configuration area as other AI DevKit agent metadata.

Secondary goals:

- Reuse the existing agent resolution and terminal delivery path for each group member.
- Provide clear output for successful sends and per-member failures.
- Make the storage format simple enough for users to inspect if needed, while keeping mutation through CLI commands.

Non-goals:

- Do not add nested groups in the first version.
- Do not add queueing, retries, or durable delivery guarantees.
- Do not start missing agents automatically.
- Do not make group membership dynamic by type, cwd, status, tag, or query.
- Do not add group management to the interactive console in this feature.
- Do not support `--wait` with `--group` in the first version.

## User Stories & Use Cases

- As a developer coordinating parallel implementation agents, I want to create `backend-team` with several agent IDs so that I can reuse the same target set.
  - `ai-devkit agent group create backend-team --agent api --agent worker --agent tests`
- As a developer, I want to add or remove agents from a group as sessions change so that the group stays useful during a feature.
  - `ai-devkit agent group add backend-team docs`
  - `ai-devkit agent group remove-agent backend-team tests`
- As a developer, I want to replace a group's members in one command so that scripts can set the exact desired state.
  - `ai-devkit agent group update backend-team --agent api-v2 --agent worker-v2`
- As a developer, I want to remove a stale group so that old agent names do not clutter my setup.
  - `ai-devkit agent group remove backend-team`
- As a developer, I want to send one prompt to all members of a group so that I can coordinate multiple agents without repeated commands.
  - `ai-devkit agent send "status update please" --group backend-team`
- As a developer using pipelines, I want stdin prompt behavior to work for groups just like it works for single agents.
  - `npm test 2>&1 | ai-devkit agent send --group backend-team --stdin`

Edge cases:

- Group name already exists on create.
- Group name does not exist for update, remove, inspect, or send.
- Group has no members after an invalid operation attempt.
- One stored member no longer resolves to a running agent.
- One stored member resolves ambiguously.
- Two stored members resolve to the same live agent.
- A target agent is not in `waiting` or `idle` status.
- One target terminal cannot be found or does not support send.
- Both `--id` and `--group` are provided.
- `--wait` or `--json` is provided with `--group`.

## Success Criteria

- `ai-devkit agent group create <name> --agent <id> --agent <id>` creates a named group with at least one member.
- `ai-devkit agent group list` displays configured groups and their member identifiers.
- `ai-devkit agent group detail <name>` displays one group's member identifiers.
- `ai-devkit agent group update <name> --agent <id> ...` replaces the full member list.
- `ai-devkit agent group add <name> <id>` appends a member and avoids duplicates.
- `ai-devkit agent group remove-agent <name> <id>` removes one member and leaves the group in a valid state.
- `ai-devkit agent group remove-agent <name> <last-member>` exits non-zero and keeps the group unchanged, because empty groups are invalid.
- `ai-devkit agent group remove <name>` deletes the group.
- Group commands report clear not-found, conflict, invalid-name, invalid-member, and malformed-storage errors.
- Group names follow the existing agent name convention: lowercase letters, digits, and hyphens; start and end with a letter or digit; 2-64 characters.
- Group member identifiers are stored as user-provided agent identifiers and resolved at send time, not copied as process IDs.
- `agent send <message> --group <name>` sends the same resolved prompt to every distinct live agent in the group.
- `agent send --group <name>` supports explicit `--stdin` and implicit piped stdin with the same validation as single-target send.
- `agent send --group <name>` reports per-agent success and per-agent failure, and exits non-zero if any member fails.
- `agent send --group <name>` fails before sending anything when the group does not exist, has no members, any member identifier is missing, or any member identifier is ambiguous.
- `--id` and `--group` are mutually exclusive.
- `--wait` with `--group` exits non-zero before sending and explains that wait mode is single-target only.
- `--json` with `--group` exits non-zero before sending because group result JSON is out of scope for this feature.
- Existing `agent send --id <agent>`, `agent list`, `agent open`, `agent rename`, and `agent detail` behavior is unchanged.

## Constraints & Assumptions

- Group storage is local to the user and machine. It is not project-shared or synced.
- Group membership uses stable user-facing agent identifiers, normally registry names, because process IDs and session IDs are not stable across restarts.
- Send fan-out is sequential in the first version to keep output deterministic and reuse existing error handling safely.
- The same terminal support constraints as single-target `agent send` apply: tmux, iTerm2, Terminal.app, and Linux via tmux.
- Subprocess calls must continue to use shell-safe patterns already used by the single-target send implementation.
- A group with duplicate member identifiers is invalid at write time.
- If two different member identifiers resolve to the same live agent at send time, the prompt is sent once and the output reports the deduplication.

## Resolved Decisions

- **Group command shape:** Use `agent group <subcommand>` for management and `agent send --group <name>` for delivery. This keeps group storage separate from message delivery while making send usage concise.
- **Wait mode:** Defer group `--wait`; it introduces response aggregation, timeout semantics, and output ordering decisions that should be designed separately.
- **Partial failures:** Send to all unambiguous, distinct resolved agents and return non-zero if any delivery fails. Ambiguous member resolution fails before sending to avoid delivering to an unintended agent.
- **Storage owner:** Implement group storage in the CLI agent service layer because groups are local CLI configuration, while `agent-manager` should stay focused on live agent discovery and terminal interaction.

## Alternatives Considered

- **Document shell loops only:** rejected because it would not provide persistent reusable groups, shared validation, or consistent failure behavior.
- **Dynamic groups by agent type, cwd, or status:** deferred because explicit groups are safer for first-version fan-out and avoid surprising targets.
- **Nested groups:** deferred because cycle detection and expansion errors add complexity without being necessary for the requested workflow.

## Questions & Open Items

- None blocking for requirements review. Group `--wait` and group JSON result output are intentionally deferred future enhancements.
