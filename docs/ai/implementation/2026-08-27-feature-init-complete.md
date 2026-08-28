---
phase: implementation
title: Complete Project Initialization Implementation
description: Implementation log for shared init/install application
---

# Complete Project Initialization Implementation

## Development Setup

- Worktree `.worktrees/feature-init-complete`, branch `feature-init-complete`, based on fetched `origin/main`.
- `npm ci` completed.
- Initial build failed in existing `packages/cli/src/util/config.ts`: Zod issue paths are `PropertyKey[]`, while `formatPath` accepts `(string | number)[]`.
- Optional task tracing is unavailable.

## Intended Structure

- `services/install`: shared orchestration, item report, and exit policy.
- `services/install/mcp`: target-aware merge and explicit parse failure.
- `commands/init.ts`: selection/persistence followed by shared application.
- `commands/install.ts`: validated load followed by the same service/renderer.
- `__tests__`: TDD unit and real-filesystem public-flow coverage.

## Implementation Log

- Added a shared application report and renderer used by both commands. Required failures and unresolved MCP conflicts now exit 1.
- Reworked `init` to persist normalized desired config, then call `reconcileAndInstall` once for environments, phases, skills, and MCP.
- Existing phase docs are preserved by default; interactive callers can approve replacement and `--overwrite` bypasses prompts.
- `SkillManager.addSkill` now distinguishes a new installation from an already matching target.
- MCP reports carry per-server/target results, explicit non-interactive policy, and physical-target deduplication for Claude/GitHub `.mcp.json`.
- All MCP readers now propagate malformed-file errors instead of treating corrupt files as empty.
- Custom registries are persisted before skill resolution; config remains the resumable desired-state record.
- Updated environment help and success/incomplete copy.
- Added real-filesystem reconciliation tests across all seven supported MCP target files.

Focused TDD evidence included intentional red failures followed by green runs for phase preservation, init MCP delegation, result/exit contracts, shared MCP targets, malformed config, skill matching, report rendering, registry ordering, and explicit non-interactive conflicts.

## Deviations and Follow-ups

No design deviations. The initial base TypeScript failure did not recur after deterministic package build; no unrelated source fix was required.
