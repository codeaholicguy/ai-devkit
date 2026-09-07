---
phase: implementation
title: Local Folder Skill Registry Implementation
description: Running implementation record
---

# Implementation

## Setup

- Worktree: .worktrees/feature-local-registry
- Branch: feature-local-registry from fetched origin/main at 60c3bc1.
- npm ci completed; initial npm run build built six projects.
- Task tracing unavailable: npx ai-devkit@latest task list --name local-registry --json returned unknown command task.

## Code Structure

- Parsing: packages/cli/src/util/skill-registry.ts
- Config edges: Config.ts, GlobalConfig.ts, InitTemplate.ts
- Preparation/update: SkillRegistry.ts
- Discovery/install/removal: SkillManager.ts
- Search: SkillIndex.ts
- CLI/status: commands/skill.ts and status.service.ts

## Implementation Log

- T1–T2: Parser/canonicalization/duplicate tests drove the explicit source boundary and base-directory normalization.
- T4: Prep-once/no-Git/cache-fallback tests drove separate read-only local and Git preparation.
- T5: Real temp-directory tests drove direct discovery, entry/file limits, and symlink containment.
- T6–T7: Indexing uses actual local roots and update treats them as live; stale same-ID caches are excluded.
- T8–T9: Removal cleans focused index and only ID-derived cache paths; status/provenance are source-aware.
- T10: Built-CLI e2e registers a relative folder, installs, removes registration, and proves the source remains.

Red evidence included missing parser functions and a missing local-registry module. Green evidence includes focused suites, 1,139 CLI tests, the full workspace suite, and e2e.

## Invariants

- file: is the only persisted local discriminator.
- Local preparation is read-only and never falls back to cache.
- Deletion derives only from ID beneath the owned cache.
- Local skill/metadata paths are canonically contained.
- Local index data is live rather than governed by remote TTL.

## Deviations

None. Limits are 10,000 direct entries and 1 MiB per SKILL.md, against a measured built-in baseline of 28 entries and a largest SKILL.md of 7,522 bytes.
