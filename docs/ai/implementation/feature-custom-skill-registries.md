---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup
**How do we get started?**

- Ensure git is installed and available in PATH.
- Identify the global config location (assumed: `~/.ai-devkit/.ai-devkit.json`).
- Prepare a sample custom registry repo for local testing.

## Code Structure
**How is the code organized?**

- `packages/cli/src/lib/SkillManager.ts`: main skill command logic
- `packages/cli/src/lib/Config.ts`: project config manager (existing)
- New: `GlobalConfigManager` for global `.ai-devkit.json`
- New or inline: registry merge helper (e.g., `RegistryResolver`)

## Implementation Notes
**Key technical details to remember:**

### Core Features
- Load default registry from remote `registry.json` (current behavior).
- Load custom registries from global config using the same `registries` map format.
- Merge registries with custom entries overriding default on registry ID collision.
- Use the merged registry map for all skill commands.
- When remote registry fetch fails, fall back to cached registry data if available.

### Patterns & Best Practices
- Keep registry merging logic centralized to avoid command drift.
- Use explicit, user-facing errors when registry IDs or skills are not found.
- Preserve existing cache behavior to maintain offline support.

## Integration Points
**How do pieces connect?**

- `SkillManager` calls into registry resolver for merged registry map.
- Registry resolver reads:
  - Remote default registry JSON
  - Global config `skillRegistries.registries`
- Repository cloning remains in `cloneRepositoryToCache`.

## Error Handling
**How do we handle failures?**

- If registry fetch fails but cache exists, continue with cache.
- If a registry ID is missing in the merged map, return available registry IDs.
- If skill path or `SKILL.md` missing, show a clear error.

## Performance Considerations
**How do we keep it fast?**

- Avoid re-cloning registries when cache exists.
- Keep registry JSON fetch to a single request per command invocation.

## Security Notes
**What security measures are in place?**

- No credential handling in CLI; rely on user-managed git credentials.
- Do not execute any scripts from cloned repositories.
