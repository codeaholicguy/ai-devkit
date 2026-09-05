---
phase: implementation
title: Remote Built-in Skills Manifest Implementation
description: Track implementation decisions, files, and design alignment
---

# Remote Built-in Skills Manifest Implementation

## Development Setup

- Worktree: `.worktrees/feature-builtin-remote`
- Branch: `feature-builtin-remote`, created from latest `origin/main`
- Bootstrap: `npm ci` and the six-project `npm run build`
- Method: TDD for each loader behavior and consumer migration

## Planned Code Structure

- `skills/built-in.json`: live bare-array manifest.
- `packages/cli/src/lib/BuiltinSkills.ts`: remote boundary, validation, promise cache, fallback, registry identity.
- Four existing consumers: asynchronous runtime list resolution.
- Focused loader and consumer tests: mocked fetch and fixture lists.

## Implementation Notes

- Added the live bare-array manifest with the 21 names present on the latest base.
- Added a single loader that shares its promise, validates remote data, and warns before returning the embedded fallback.
- Migrated init, skill add, setup, and status to await runtime names.
- Deleted the obsolete constants module and literal union.
- Left `SkillManager` unchanged because it already resolves validated runtime names from `skills/<name>/SKILL.md`.

## Error Handling

All remote failures warn once and return the embedded fallback. Invalid manifests are rejected wholesale.

## Security Notes

The remote list controls installation membership. The loader validates the full array at the network boundary before exposing names internally.

## Progress

- [x] Loader and manifest
- [x] Consumer migration
- [x] Implementation alignment check
- [x] Full validation

## Verification Evidence

- Focused suite: 7 files, 97 tests passed.
- CLI build: TypeScript declarations and 221 source files compiled successfully.
- Full build: all 6 projects passed.
- Full unit suite: all 6 projects passed serially, 2177 tests total.
- Full lint: all 6 projects passed.
- E2E: 41 tests passed.
- Optional task tracing was unavailable: `npx ai-devkit@latest task list --name builtin-remote --json` returned `unknown command 'task'`.

## Design Alignment

The implementation matches the approved single-loader data flow, all-or-nothing validation, process-local promise caching, embedded fallback, runtime string typing, and four consumer boundaries. No design deviations or follow-up work were identified.
