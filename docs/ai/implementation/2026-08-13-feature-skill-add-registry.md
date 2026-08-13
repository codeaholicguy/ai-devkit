---
phase: implementation
title: Implementation Guide
description: Implementation record for project/global registry persistence and CLI wiring
---

# Implementation Guide

## Development Setup

- Worktree: `feature-skill-add-registry`.
- Bootstrap: `npm ci`, then `npm run build` so internal workspace package entry points resolve during the full test suite.
- Lifecycle validation: `npx ai-devkit@latest lint --feature skill-add-registry`.
- Optional task tracing is unavailable in `ai-devkit@0.48.0` (`unknown command 'task'`).

## Code Structure

- `packages/cli/src/util/skill-registry.ts`: shared pure add/idempotency/conflict/force decision and merge logic.
- `packages/cli/src/lib/Config.ts`: project setter using the existing config read/update boundary.
- `packages/cli/src/lib/GlobalConfig.ts`: planned global setter and malformed-file guard.
- `packages/cli/src/commands/skill.ts`: planned flat CLI command.
- `packages/cli/src/__tests__/`: mocked-boundary tests; no real user config, network, Git, or cache I/O.

## Implementation Notes

### Completed: Task 1 — project persistence

- `ConfigManager.addSkillRegistry(id, url, options?)` reads the required project config, filters its registry map to string values, applies shared mutation rules, returns immediately for an identical entry, and delegates changed maps to `update()`.
- `planSkillRegistryAdd()` preserves the URL as opaque input and returns `added`, `already-registered`, or `updated` status. A same-scope conflict throws `CliError` code `REGISTRY_CONFLICT` with both existing/requested values; force permits replacement.
- Existing registry entries and unrelated top-level config remain intact.
- Edge cases covered: missing project config, identical no-write, conflicting no-write, forced replacement, arbitrary URL string.

### Pending

- Task 2: global setter and malformed-config protection.
- Task 3: CLI parsing, validation, scope selection, flags, and output.
- Tasks 4–5: design reconciliation, final coverage/regression, and review.

## Integration Points

The setters modify only `registries` in the selected config. Existing `SkillRegistry.fetchMergedRegistry()` already consumes default < global < project maps for downstream commands; no changes to that class are planned.

## Error Handling

- Missing project config retains `ConfigNotFoundError` guidance to run `ai-devkit init`.
- Same-scope conflicts use `REGISTRY_CONFLICT` and direct users to `--force`.
- No URL error exists by design.

## Performance & Security

- The pure merge is linear in the registry-map size and adds only config read/write I/O.
- URL values are stored verbatim, never executed, parsed, normalized, or transmitted.
- Registration imports no Git/network/cache utility.

## Verification Record

- Task 1: `npx vitest run src/__tests__/lib/Config.test.ts --coverage --coverage.include=src/util/skill-registry.ts` — 49/49 passed; new helper 100% statements, branches, functions, and lines.
