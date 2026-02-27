---
phase: implementation
title: Implementation Guide
description: Implementation notes for project-level registry override precedence
---

# Implementation Guide

## Development Setup
- Work in feature branch/worktree: `feature-project-skill-registry-priority`.
- Install deps via `npm ci`.

## Code Structure
- `SkillManager` owns merged registry resolution.
- `ConfigManager` owns project config parsing helpers.

## Implementation Notes
### Core Features
- Added `ConfigManager.getSkillRegistries()` to read project registry map from:
  - `registries` (root), or
  - `skills.registries` (legacy-compatible fallback when `skills` is object).
- Updated `SkillManager.fetchMergedRegistry()` to merge in this order:
  - default registry,
  - global registries,
  - project registries.

### Patterns & Best Practices
- Ignore malformed/non-string registry values.
- Keep merge deterministic and centralized.

## Error Handling
- If project config has no valid registry map, return `{}` and continue.
- Existing default-registry fetch warning behavior remains unchanged.

## Performance Considerations
- No new network requests.
- Constant-time map merge relative to source map sizes.

## Check Implementation (Phase 6)
- Requirements-to-code mapping:
- Project registry source support implemented in `packages/cli/src/lib/Config.ts` via `getSkillRegistries()`.
- Precedence contract (`project > global > default`) implemented in `packages/cli/src/lib/SkillManager.ts` within `fetchMergedRegistry()`.
- Compatibility preserved:
- Existing global override behavior still works.
- Default registry fetch fallback behavior unchanged.

## Code Review (Phase 8)
- Reviewed changed production files for regressions in install flow and config parsing.
- No blocking issues found.
- Residual risk: only unit-level validation was run; end-to-end CLI fixture validation is still optional follow-up.
