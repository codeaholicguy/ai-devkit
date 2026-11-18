---
phase: requirements
title: Agent group management in daemon.db
description: Approved scope and acceptance criteria for issue 413
---

# Agent group management in daemon.db

## Problem Statement

Group commands and group fanout currently read and modify agent-groups.json in
client processes. Move ownership to daemon.db so one daemon serializes group
changes and resolves authoritative membership for CLI users and agent workflows.
Source: issue #413, the supplied brief, and the user's 2026-11-18 design rulings.

## Goals & Objectives

- R1: Route all seven existing group subcommands through typed group RPCs.
- R2: Store groups and ordered membership rows transactionally in daemon.db.
- R3: Resolve send --group via group.lookup followed by per-member agent.lookup;
  retain client-side sends, ordered targets and per-member reporting.
- R4: Import legacy version-1 JSON once with a transactional ownership fence.
- R5: Preserve domain validation, error categories, timestamps and output shapes.
- R6: Require a capable daemon; no stale JSON fallback on any failure.

Non-goals: daemon-side message delivery, membership tied to process lifetime,
changes to ordinary single-agent send, dependencies on open PR #456, continuous
legacy synchronization, or support for concurrent writes by older CLI versions.
Rows were chosen over a JSON column for ordered transactional operations; daemon
availability was chosen over frozen-file reads; source deletion was chosen over
keeping a misleading frozen legacy reference. All three choices are approved.

## User Stories & Use Cases

- CLI users create, replace, add, remove members, delete, list and inspect groups
  through existing commands without learning a new command syntax.
- Senders use authoritative ordered membership and daemon agent locations, with
  existing client-side runtime delivery and failure reporting.
- Upgrading users retain valid group names, members, timestamps and list order;
  deleted or updated groups cannot reappear from an old JSON file.
- Users receive explicit errors for unavailable/old daemons, invalid input,
  missing groups, conflicts and failed imports rather than silent fallback.

## Success Criteria

- A1 (R1/R2): create/update/add/remove_agent/remove/list/detail RPCs cover all seven
  commands; group.lookup returns ordered membership. Restart preserves state.
- A2 (R2/R5): group names trim and match AGENT_NAME_REGEX; members trim, reject
  blanks and duplicates, and need not be registered agents. At least one member
  remains. Adding an existing member is a no-op including updatedAt. Removing an
  absent member is InvalidMember; removing the last is EmptyMembers.
- A3 (R5): preserve NotFound, Conflict, InvalidName, InvalidMember, EmptyMembers
  and Storage categories in Rust-to-CLI error mapping and observable precedence.
- A4 (R3/R6): send --group resolves membership and member locations through the
  daemon without JSON or local-registry fallback; sends stay client-side.
- A5 (R4): valid import preserves data and commits all rows plus ownership in one
  transaction. Missing source fences an empty initial state. Malformed/version/
  domain/conflict failures preserve the source and do not commit partial rows or
  ownership. Failed group import does not disable unrelated daemon operations.
- A6 (R4): unlink only after commit. Report cleanup failure and retry next startup;
  never re-import owned data, including after restart or source recreation.
- A7 (R6): unavailable daemon, unsupported group methods and mid-request transport
  failure give actionable errors without retrying against JSON.
- A8: Rust store/RPC tests, daemon-client and CLI tests, full CLI suite, real-daemon
  built-CLI E2E and smoke pass; lint, formatting and clippy pass. Review and rebase
  onto origin/main precede the PR. No commit/push before validation gates pass.

## Constraints & Assumptions

Use main's store/protocol/capability patterns, independent of PR #456. Preserve
insertion order for listing and input order for membership. Keep TypeScript unit
and integration tests in packages/<pkg>/tests and E2E in root e2e. Build workspace
dependencies before package tests. Use disposable homes and stub registrations;
never touch real user group/agent data during validation. Stop older CLI writers
before upgrading; reverting to an old CLI cannot recover deleted legacy JSON.
Schema and ownership data are daemon-written only. No new authentication model
is introduced beyond the existing daemon transport boundaries.

## Questions & Open Items

None requiring a ruling. The three design decisions are approved. Implementation
must verify capability detection, data-home resolution and generated protocol
workflow against main; these are repository details, not changes to approved scope.
