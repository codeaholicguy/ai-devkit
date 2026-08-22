---
phase: implementation
title: Skill Registry Removal Implementation
description: Implementation record for skill remove-registry
---

# Skill Registry Removal Implementation

## Development Setup

Use repository Node/npm. Run `npm ci` and `npm run build` before full gates.

## Code Structure

Changes are confined to CLI registry utilities, config managers, skill index/manager, command registration, their tests, and user/lifecycle documentation.

## Implementation Notes

- Follow red-green-refactor for planner, config, index, and command slices.
- Reuse validation and add-registry scope conventions.
- Keep the planner copy-on-write and I/O-free.
- Remove only the selected map entry and clean index data locally.
- Never call registry fetch/update during removal.
- Preserve cache and installed skills and say so in successful output.
- No `--purge-cache`, `--yes`, or registry-group migration in v1.
- Implemented the pure own-property removal planner and project/global persistence methods. Targeted planner/config suites pass (71 tests).
- Implemented focused index filtering and the scoped command. The complete shipped default-registry ID snapshot is embedded for deterministic offline protection; configured shadows remain removable.

## Integration Points

The command reads project/global registries and default metadata, writes one config manager, then invokes focused derived-index cleanup. Lower-precedence shadows are reported and repopulate on a later refresh.

## Error Handling

Reject invalid IDs and default-only registries before writes. Wrong-scope errors explain the correct flag. Missing IDs list sorted project/global registrations. After config write, index failure reports partial success and the rebuild command.

## Performance Considerations

Config maps are small; focused cleanup is a linear local index pass with no network latency.

## Security Notes

Validate IDs before use. Never mutate built-in/default data, cache directories, or installed skill paths.

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
