---
phase: requirements
title: Skill Registry Removal Requirements
description: Add the safe inverse of skill add-registry
---

# Skill Registry Removal Requirements

## Problem Statement

Users can register project or global skill registries with `skill add-registry`, but cannot unregister them. Manual config edits can leave stale search-index entries and make scope precedence unclear.

## Goals & Objectives

- Add `skill remove-registry <id>` beside `add-registry`.
- Default to project scope; use `-g`/`--global` for global scope.
- Remove only the selected config entry and locally clean stale index data without network access.
- Preserve cache repositories and installed skills.
- Protect built-in/default registries while allowing a user shadow to be removed.

Non-goals: cache purge, installed-skill removal, registry-group command migration, or changes to unrelated update behavior.

## User Stories & Use Cases

- Remove a project registry without affecting a same-ID global registration.
- Remove only a global registration with `--global`.
- When removing a shadow, report which lower-precedence source remains active.
- Give automation deterministic exact messages without prompts or network traffic.
- Give actionable wrong-scope hints or a sorted registry inventory.

## Success Criteria

- Reuse `validateRegistryId` before config/index work.
- A pure copy-on-write planner returns `removed` or `not-registered`, including the removed URL.
- Config writers preserve unrelated keys and registry entries.
- Removed-only registry entries leave the local index; sibling data remains intact.
- If another source remains, invalidate the ID locally for later refresh.
- Built-in/default-only sources cannot be removed; user shadows can.
- Tests give the planner 100% coverage and cover scope, messages, preservation, and no-network behavior.
- User docs and changelog describe the command and safe boundary.

## Constraints & Assumptions

- Configuration is written before derived-index cleanup. Index failure reports the rebuild command and does not roll config back.
- Built-in/default registry metadata is read-only. Removal never fetches registry data.
- Cache and installations are always untouched in v1.
- `--purge-cache` is deferred with future safety semantics documented.

## Questions & Open Items

All material questions are resolved by the approved design. Follow-ups: guarded `--purge-cache` and coordinated registry-group aliases/migration.
