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
- `packages/cli/src/lib/GlobalConfig.ts`: global setter and malformed-file guard.
- `packages/cli/src/commands/skill.ts`: flat CLI command, validation, scope selection, status output, and flags.
- `packages/cli/src/__tests__/`: mocked-boundary tests; no real user config, network, Git, or cache I/O.

## Implementation Notes

### Completed: Task 1 — project persistence

- `ConfigManager.addSkillRegistry(id, url, options?)` reads the required project config, filters its registry map to string values, applies shared mutation rules, returns immediately for an identical entry, and delegates changed maps to `update()`.
- `planSkillRegistryAdd()` preserves the URL as opaque input and returns `added`, `already-registered`, or `updated` status. A same-scope conflict throws `CliError` code `REGISTRY_CONFLICT` with both existing/requested values; force permits replacement.
- Existing registry entries and unrelated top-level config remain intact.
- Edge cases covered: missing project config, identical no-write, conflicting no-write, forced replacement, arbitrary URL string.

### Completed: Task 2 — global persistence

- `GlobalConfigManager.addSkillRegistry(id, url, options?)` checks whether the file exists before calling the tolerant `read()` method.
- A missing file starts from `{}` and is created through the existing private `write()` boundary.
- A present file that produces `null` from `read()` fails with `GLOBAL_CONFIG_UNREADABLE`; it is never replaced.
- Valid config preserves unrelated fields and sibling registries, reuses the shared conflict/force rules, and returns without writing for an identical entry.

### Completed: Task 3 — CLI command

- `skill add-registry <id> <url>` is a flat sibling of existing skill commands; no registry removal/listing command was added.
- `validateRegistryId()` runs before any manager access. URL is forwarded unchanged.
- Project scope is the default; `-g/--global` selects `GlobalConfigManager`; `-f/--force` is forwarded to the shared decision and setter.
- The command reads only the selected target's configured registries to report `registered`, `already registered`, or `updated`, then invokes the authoritative setter.
- The command imports no `SkillRegistry`, Git, network, index, or cache module. Same-as-default entries are therefore persisted without fetching defaults.

### Pending

- Tasks 4–5: design reconciliation, final coverage/regression, and review.

## Integration Points

The setters modify only `registries` in the selected config. Existing `SkillRegistry.fetchMergedRegistry()` already consumes default < global < project maps for downstream commands; no changes to that class are planned.

## Error Handling

- Missing project config retains `ConfigNotFoundError` guidance to run `ai-devkit init`.
- Same-scope conflicts use `REGISTRY_CONFLICT` and direct users to `--force`.
- Present unreadable global config uses `GLOBAL_CONFIG_UNREADABLE` and includes the protected path.
- No URL error exists by design.

## Performance & Security

- The pure merge is linear in the registry-map size and adds only config read/write I/O.
- URL values are stored verbatim, never executed, parsed, normalized, or transmitted.
- Registration imports no Git/network/cache utility.

## Verification Record

- Task 1: `npx vitest run src/__tests__/lib/Config.test.ts --coverage --coverage.include=src/util/skill-registry.ts` — 49/49 passed; new helper 100% statements, branches, functions, and lines.
- Task 2: `npx vitest run src/__tests__/lib/GlobalConfig.test.ts` — 15/15 passed.
- Task 3: `npm run lint`, `npm run build`, and the combined command/config coverage run — build/lint green, 90/90 tests passed, helper coverage 100%.
