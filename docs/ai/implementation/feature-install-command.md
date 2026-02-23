---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
feature: install-command
---

# Implementation Guide - Install Command

## Development Setup

- Implemented in `packages/cli` using existing command architecture (`commander`).
- Uses `zod` for schema-based config validation.
- Feature reuses existing managers: `ConfigManager`, `TemplateManager`, `SkillManager`.

## Code Structure

- `packages/cli/src/commands/install.ts`
  - New CLI handler for `ai-devkit install`.
  - Handles config loading, report output, and process exit code.
- `packages/cli/src/services/config/config.service.ts`
  - Loads and parses config file JSON from disk.
- `packages/cli/src/util/config.ts`
  - Validates and normalizes install config data using Zod.
  - Supports skill shape normalization (`name` and legacy `skill` key).
- `packages/cli/src/services/install/install.service.ts`
  - Reconciles desired state and applies environment/phase/skill installation.
  - Implements overwrite and warning-based partial-failure policy.
- `packages/cli/src/types.ts`
  - Adds optional `skills` metadata to `DevKitConfig`.
- `packages/cli/src/lib/Config.ts`
  - Adds `addSkill` helper to persist unique `registry + name` entries.
- `packages/cli/src/lib/SkillManager.ts`
  - Persists metadata to `.ai-devkit.json` after successful `skill add`.
- `packages/cli/src/cli.ts`
  - Registers new `install` command and options.

## Implementation Notes

### CLI Surface

- `ai-devkit install`
- Options:
  - `--config <path>`: alternate config file path (default `.ai-devkit.json`)
  - `--overwrite`: overwrite all existing artifacts without additional prompts

### Reconcile Behavior

- Environments and phases are installed section-by-section.
- Existing artifacts are skipped unless overwrite mode is confirmed.
- Skill failures are collected as warnings and do not fail run by default.
- Skills are deduplicated by `registry + name` before installation.

### Exit Code Policy

- `1` for invalid/missing config.
- `1` for environment/phase failures.
- `0` for successful run and for skill-only partial failures.

## Error Handling

- Validation errors include field-level context and config file path.
- Orchestrator aggregates per-item warnings and reports all failures at the end.
- Install command prints summary and warnings before setting final exit code.

## Performance Considerations

- Linear processing by environments/phases/skills.
- No additional network calls beyond existing `SkillManager` behavior.
- Config normalization avoids duplicate work for duplicate entries.

## Security Notes

- Input is validated before filesystem/network operations.
- Unsupported environments/phases are rejected early.
- Empty/invalid skill metadata is rejected before installation.
