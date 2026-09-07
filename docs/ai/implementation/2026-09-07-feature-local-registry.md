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

Pending. Each task records red/green/refactor evidence here.

## Invariants

- file: is the only persisted local discriminator.
- Local preparation is read-only and never falls back to cache.
- Deletion derives only from ID beneath the owned cache.
- Local skill/metadata paths are canonically contained.
- Local index data is live rather than governed by remote TTL.

## Deviations

None.
