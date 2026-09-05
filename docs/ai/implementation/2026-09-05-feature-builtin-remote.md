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

No production implementation has started. The design intentionally leaves `SkillManager` unchanged because it already resolves validated runtime names from `skills/<name>/SKILL.md`.

## Error Handling

All remote failures warn once and return the embedded fallback. Invalid manifests are rejected wholesale.

## Security Notes

The remote list controls installation membership. The loader validates the full array at the network boundary before exposing names internally.

## Progress

- [ ] Loader and manifest
- [ ] Consumer migration
- [ ] Implementation alignment check
- [ ] Full validation
