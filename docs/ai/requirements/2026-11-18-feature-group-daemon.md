---
phase: requirements
title: Agent group management in daemon.db
description: Approved scope and acceptance criteria for issue 413
---

# Agent group management in daemon.db

## Problem Statement

Group commands and group fanout previously read and modified `agent-groups.json`
in client processes. Move ownership to `daemon.db` so one daemon serializes
group changes and resolves authoritative membership for CLI users and agent
workflows. Source: issue #413, the supplied brief, and the user's 2026-11-18 and
2026-11-24 design rulings.

## Goals & Objectives

- R1: Route all seven existing group subcommands (`create`, `update`, `add`,
  `remove-agent`, `remove`, `list`, `detail`) through typed group RPCs, with
  `--debug` logging support matching the other `agent` commands.
- R2: Store groups and ordered membership rows transactionally in `daemon.db`.
- R3: Resolve `send --group` via `group.lookup` followed by per-member
  `agent.lookup` over a single daemon connection; retain client-side sends,
  ordered targets, and per-member reporting.
- R4: Preserve domain validation, error categories, timestamps, and output
  shapes.
- R5: Require a capable daemon; no JSON fallback on any failure.

Non-goals: legacy `agent-groups.json` migration/import (removed on 2026-11-24 —
no users rely on the legacy file yet), daemon-side message delivery, membership
tied to process lifetime, changes to ordinary single-agent send, or continuous
legacy synchronization.

## User Stories & Use Cases

- CLI users create, replace, add, remove members, delete, list, and inspect
  groups through existing commands (with optional `--debug`) without learning a
  new command syntax.
- Senders use authoritative ordered membership and daemon agent locations, with
  existing client-side runtime delivery and failure reporting.
- Users receive explicit errors for unavailable/old daemons, transport failures,
  invalid input, missing groups, and conflicts rather than silent fallback.

## Success Criteria

- A1 (R1/R2): `create`/`update`/`add`/`remove_agent`/`remove`/`list`/`detail`
  RPCs cover all seven commands; `group.lookup` returns ordered membership.
  Restart preserves state.
- A2 (R2/R4): Group names trim and match `AGENT_NAME_REGEX`; members trim,
  reject blanks and duplicates, and need not be registered agents. At least one
  member remains. Adding an existing member is a no-op including `updatedAt`.
  Removing an absent member is `InvalidMember`; removing the last is
  `EmptyMembers`.
- A3 (R4): Preserve `NotFound`, `Conflict`, `InvalidName`, `InvalidMember`,
  `EmptyMembers`, and `Storage` categories in Rust-to-CLI error mapping and
  observable precedence.
- A4 (R3/R5): `send --group` resolves membership and member locations through
  the daemon without JSON or local-registry fallback; sends stay client-side.
  Only `not_found` and dead registrations are treated as member resolution
  errors; transport failures and unsupported methods abort immediately.
- A5 (R5): Unavailable daemon, unsupported group methods, and mid-request
  transport failure give actionable errors without retrying against JSON.
- A6: Rust store/RPC tests, daemon-client and CLI tests, full CLI suite,
  real-daemon built-CLI E2E, lint, formatting, and clippy pass.

## Constraints & Assumptions

Use `main`'s store/protocol/capability patterns. Preserve insertion order for
listing and input order for membership. Keep TypeScript unit and integration
tests in `packages/<pkg>/tests` and E2E in root `e2e/`. Build workspace
dependencies before package tests. Use disposable homes and stub registrations;
never touch real user group/agent data during validation. No legacy JSON
migration is performed. No new authentication model is introduced beyond the
existing daemon transport boundaries.

## Questions & Open Items

None. All design decisions (normalized membership rows, daemon-required without
JSON fallback, and removal of the legacy JSON migration path) are approved.
