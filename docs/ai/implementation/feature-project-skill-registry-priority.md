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
- Date: 2026-02-27
- Verification checklist:
- [x] Requirement: project config contributes registry mappings.
  - Implemented in `ConfigManager.getSkillRegistries()` (`packages/cli/src/lib/Config.ts`).
- [x] Requirement: precedence is `project > global > default`.
  - Implemented in `SkillManager.fetchMergedRegistry()` merge order (`packages/cli/src/lib/SkillManager.ts`).
- [x] Requirement: backward compatibility for existing flows.
  - Existing global override behavior remains active.
  - Default registry fetch failure still falls back to other sources.

## Code Review (Phase 8)
- Date: 2026-02-27
- Findings: No blocking defects found in changed production code.
- Reviewed scope:
  - `packages/cli/src/lib/Config.ts`
  - `packages/cli/src/lib/SkillManager.ts`
  - Updated unit tests for precedence and parsing behavior.
- Residual risks:
  - Full CLI suite currently has one unrelated failing test (`commands/memory.test.ts` module resolution).
  - End-to-end fixture coverage for project-level registry override remains optional follow-up.
