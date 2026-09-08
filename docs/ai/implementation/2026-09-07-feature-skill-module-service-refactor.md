---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup
**How do we get started?**

- Active worktree: `.worktrees/feature-skill-module-service-refactor`
- Branch: `feature-skill-module-service-refactor`
- Dependency bootstrap: `npm ci`

## Code Structure
**How is the code organized?**

Target structure:

```text
packages/cli/src/services/skill/
  skill.service.ts
  skill.types.ts
  skill-validation.ts
  skill-description.ts
  skill-builtins.ts

  registry/
    skill-registry.service.ts
    skill-registry-source.ts
    registry-skill-discovery.ts

  installer/
    skill-installer.service.ts

  index/
    skill-index.service.ts
    skill-index.repository.ts
```

Naming convention:
- dot suffixes for architectural roles: `.service.ts`, `.repository.ts`, `.types.ts`.
- hyphenated descriptive names for domain helpers.

## Implementation Notes
**Key technical details to remember:**

### Core Features
- Moved code first with minimal behavior changes.
- Added `SkillService` as the import boundary for skill workflows.
- Kept command table/status rendering in `commands/skill.ts`.
- Moved interactive skill selection into `commands/skill.ts`; installer services now list installable choices and install explicit skill names.
- Consolidated registry directory scanning in `registry/registry-skill-discovery.ts`.
- Inlined installer target resolution into `installer/skill-installer.service.ts`.
- Removed old skill-specific files from `lib` and `util` after imports/tests were updated.
- Moved skill-specific tests under `src/__tests__/services/skill`.

### Patterns & Best Practices
- Preserve existing ESM `.js` import specifiers.
- Prefer explicit names for searchability.
- Keep service collaborators injectable where tests need mocks.

## Integration Points
**How do pieces connect?**

- `commands/skill.ts` imports `SkillService` from `services/skill/skill.service.ts`.
- `services/install/install.service.ts` imports the same skill service boundary.
- `services/setup/setup.service.ts`, `commands/init.ts`, and `services/status/status.service.ts` import built-ins from `services/skill/skill-builtins.ts`.
- Registry service continues to depend on `ConfigManager`, `GlobalConfigManager`, and Git helpers.

## Implementation Summary

- `services/skill/skill.service.ts` is now a thin facade over installer, registry, and index services.
- `services/skill/registry/registry-skill-discovery.ts` owns registry-directory skill discovery and local registry containment checks.
- `services/skill/installer/skill-installer.service.ts` owns target resolution, installable skill discovery plus add/list/remove installed skill behavior.
- `commands/skill.ts` owns interactive registry skill selection and cancellation handling.
- `services/skill/registry/skill-registry.service.ts` owns registry merge, cache, update, and add/remove source workflows.
- `services/skill/index/skill-index.service.ts` owns search/index lifecycle policy.
- `services/skill/index/skill-index.repository.ts` owns JSON index persistence.

## Error Handling
**How do we handle failures?**

- Preserve existing `CliError`, `ValidationError`, `NotFoundError`, stale index fallback, and local registry error messages where practical.
- Command-specific error rendering remains in command layer or existing `withErrorHandler`.

## Performance Considerations
**How do we keep it fast?**

- Preserve merged registry promise caching and prepared repository caching.
- Preserve index TTL, seed index, and GitHub fetch concurrency.

## Security Notes
**What security measures are in place?**

- Preserve registry id and skill name validation.
- Preserve local registry symlink/path containment checks.
- Preserve guarded cache removal under `~/.ai-devkit/skills`.
