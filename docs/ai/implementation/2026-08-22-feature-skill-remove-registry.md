---
phase: implementation
title: Skill Registry Removal Implementation
description: Implementation record for skill remove-registry
---

# Skill Registry Removal Implementation

## Development Setup

Use repository Node/npm. Run `npm ci` and `npm run build` before full gates.

## Code Structure

Changes are confined to CLI registry utilities, config managers, command registration, their tests, and user/lifecycle documentation. The follow-up removes the earlier index/manager additions.

## Implementation Notes

- Follow red-green-refactor for planner, config, index, and command slices.
- Reuse validation and add-registry scope conventions.
- Keep the planner copy-on-write and I/O-free.
- Remove only the selected map entry and leave the seed-backed discovery index unchanged.
- Never call registry fetch/update during removal.
- Preserve cache for project removal; delete the contained registry cache path for global removal.
- Implemented the pure own-property removal planner and project/global persistence methods. Targeted planner/config suites pass (71 tests).
- Removed focused index filtering because `SEED_INDEX_URL` intentionally catalogs unconfigured registries, making removed-registry entries equivalent to normal seed entries.
- Removed the frozen default-registry ID snapshot. Defaults are structurally protected because the planner and command only act on own properties in the selected user config map.
- Removed redundant command-level planner execution; config managers remain the single persistence planning layer.

## Integration Points

The command reads only the selected config map and delegates removal to its manager. For global removal, it additionally calls `SkillManager.removeRegistryCache(id)`, which resolves the cache root and target, verifies that the target is a strict descendant, and recursively removes that cache directory. The command layer contains no filesystem logic.

## Error Handling

Reject invalid IDs and the built-in registry before writes. A missing own property returns `Registry <id> is not registered (try --global).`. Unsafe resolved cache paths are rejected before config mutation or recursive deletion.

## Performance Considerations

Config maps are small. Project removal is constant-time apart from config I/O; global cache deletion is proportional to the cached repository size.

## Security Notes

Validate IDs before path construction. Resolve both cache root and target, require a strict contained target, and only then permit recursive removal. Never traverse installed-skill paths.

## Validation Evidence

Fresh validation on 2026-08-22 completed after resuming the interrupted session:

- `npm run build`: exit 0; Nx built all 6 projects.
- `npm test`: exit 0; all 6 projects passed (1,962 tests across 140 files).
- `npm run lint`: exit 0; all 6 projects passed with 4 existing unused-catch warnings and no errors.
- `npx ai-devkit@latest lint`: exit 0.
- `npx ai-devkit@latest lint --feature skill-remove-registry`: exit 0.
- Targeted Vitest command for planner, config, index/manager, and command suites: exit 0; 184 tests across 5 files.
- Planner-module coverage: 100% statements, branches, functions, and lines (12/12 statements, 11/11 branches, 2/2 functions, 12/12 lines).
- `node dist/cli.js skill remove-registry --help`: exit 0; exposes `-g, --global` and standard help only.
- `git diff --check`: exit 0.

Optional task tracing was unavailable: `npx ai-devkit@latest task list --name skill-remove-registry --json` returned `error: unknown command 'task'`.

Review follow-up validation on 2026-08-22:

- `npm run build`: exit 0; Nx built all 6 projects.
- `npm test`: exit 0; all 6 projects passed (1,954 tests across 140 files).
- `npm run lint`: exit 0; all 6 projects passed with 4 existing unused-catch warnings and no errors.
- Targeted Vitest command for command, planner, config, and manager suites: exit 0; 176 tests across 5 files.
- Planner-module coverage: 100% statements, branches, functions, and lines (11/11 statements, 11/11 branches, 2/2 functions, 11/11 lines).
- Feature lifecycle lint and built `remove-registry --help`: exit 0.
