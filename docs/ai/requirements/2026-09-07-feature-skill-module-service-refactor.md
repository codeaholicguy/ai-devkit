---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement
**What problem are we solving?**

- The CLI skill module is currently split across `commands/skill.ts`, `lib/SkillManager.ts`, `lib/SkillRegistry.ts`, `lib/SkillIndex.ts`, and several `util/skill*` helpers.
- `SkillManager` has grown into a broad class that owns installation, removal, listing, environment resolution, prompt handling, filesystem operations, and registry/index delegation.
- `commands/skill.ts` contains registry mutation workflow details that should live behind a service boundary.
- Maintainers and contributors are affected because skill behavior is harder to scale, search, and test in focused units.

## Goals & Objectives
**What do we want to achieve?**

- Move skill behavior under `packages/cli/src/services/skill`.
- Introduce a clear command-to-service layering model:
  - command layer parses CLI args, owns exit codes, and renders command output.
  - skill service layer owns application workflows.
  - collaborator services own registry, installer, and index behavior.
- Replace the broad `SkillManager` concept with `SkillService`, without keeping a long-term compatibility wrapper.
- Use explicit, searchable names such as `skill-registry.service.ts`, `skill-installer.service.ts`, and `skill-index.repository.ts`.
- Keep behavior and public CLI contracts unchanged.
- Preserve existing local registry security checks, registry conflict handling, install behavior, built-in skill behavior, and index fallback behavior.

Non-goals:
- Do not change user-facing CLI syntax.
- Do not redesign registry/index algorithms beyond the structural move.
- Do not introduce a package-wide clean architecture pattern.
- Do not push or publish changes; user will review before push.

## User Stories & Use Cases
**How will users interact with the solution?**

- As a maintainer, I want `commands/skill.ts` to call a single skill service boundary so command code stays easy to scan.
- As a contributor, I want registry, installer, and index behavior grouped by subdomain so I can find related logic quickly.
- As a test author, I want smaller services and helpers so tests can target one workflow without mocking unrelated behavior.
- Existing CLI users should keep using:
  - `ai-devkit skill add`
  - `ai-devkit skill add-registry`
  - `ai-devkit skill remove-registry`
  - `ai-devkit skill list`
  - `ai-devkit skill remove`
  - `ai-devkit skill update`
  - `ai-devkit skill find`
  - `ai-devkit skill rebuild-index`

## Success Criteria
**How will we know when we're done?**

- `commands/skill.ts` delegates skill workflows to `services/skill/skill.service.ts`.
- Skill files are organized under:
  - `services/skill/registry`
  - `services/skill/installer`
  - `services/skill/index`
  - shared root skill-domain files.
- Internal imports no longer depend on `lib/SkillManager.ts`, `lib/SkillRegistry.ts`, `lib/SkillIndex.ts`, `lib/BuiltinSkills.ts`, `util/skill.ts`, `util/skill-registry.ts`, or `util/local-registry.ts`.
- Existing tests are updated to the new paths and still pass.
- `npm --workspace packages/cli test -- skill`, `npm --workspace packages/cli run lint`, and `npm --workspace packages/cli run build` pass.

## Constraints & Assumptions
**What limitations do we need to work within?**

- The repo uses ESM-style `.js` import specifiers in TypeScript source.
- The refactor should follow existing `commands -> services -> lower-level helpers` direction used by install/setup commands.
- Some tests mock module paths directly, so tests must be moved or updated with the source move.
- `SkillService` remains internal to `packages/cli`; no external compatibility wrapper is required.
- Existing untracked files in the main checkout are unrelated and must not be modified.

## Questions & Open Items
**What do we still need to clarify?**

- None. Naming and structure have been agreed with the user in this thread.
