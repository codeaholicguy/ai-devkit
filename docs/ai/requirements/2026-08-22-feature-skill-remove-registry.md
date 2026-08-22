---
phase: requirements
title: Skill Registry Removal Requirements
description: Add the safe inverse of skill add-registry
---

# Skill Registry Removal Requirements

## Problem Statement

Users can register project or global skill registries with `skill add-registry`, but cannot unregister them without editing configuration manually.

## Goals & Objectives

- Add `skill remove-registry <id>` beside `add-registry`.
- Default to project-only removal and preserve its cached repository.
- Use `-g`/`--global` to remove the global entry and recursively delete that registry's cache directory.
- Leave the discovery index unchanged because seed entries do not imply local registration.
- Protect the built-in registry explicitly; default registries remain protected structurally because they are absent from user config maps.

Non-goals: discovery-index cleanup, installed-skill traversal/removal, registry-group command migration, or changes to unrelated update behavior.

## User Stories & Use Cases

- Remove a project registry without affecting a same-ID global registration.
- Remove a global registration and its cache with `--global`.
- Give automation deterministic output without prompts or network traffic.
- Reject missing registrations with a concise `try --global` hint.

## Success Criteria

- Reuse `validateRegistryId` before config work or path deletion.
- A pure copy-on-write planner returns `removed` or `not-registered` with the next registry map.
- Config writers preserve unrelated keys and registry entries.
- Removal leaves the seed-backed discovery index unchanged.
- Global cache deletion resolves the target and proves it is contained inside `SKILL_CACHE_DIR` before recursive removal.
- The built-in source cannot be removed; defaults absent from the selected config map fail the own-property guard.
- Tests cover planner behavior, both scopes, cache deletion, validation order, and exact messages.
- User docs and changelog describe the command and safe boundary.

## Constraints & Assumptions

- Removal never fetches registry or index data.
- Project removal never deletes cache data.
- Global removal deletes `~/.ai-devkit/skills/<id>` after containment validation; it does not traverse installed-skill locations.

## Questions & Open Items

All material questions are resolved by the approved simplification. A coordinated registry-group alias/migration remains a possible follow-up.
