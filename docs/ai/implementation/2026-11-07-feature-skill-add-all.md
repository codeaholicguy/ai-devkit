---
phase: implementation
title: Implementation Notes
description: Record what was built, where, and any deviations from design
---

# Implementation Notes

## What was built

- `packages/cli/src/services/skill/skill.types.ts` — `AddAllSkillOptions` (exclude/dryRun/confirmInstall), `AddAllSkillItem` (`{skill, status, error?}`), `AddAllSkillsResult`.
- `packages/cli/src/services/skill/skill-validation.ts` — `globToRegExp` (`*`/`?` glob → anchored RegExp over `[a-z0-9-]`; no new dependency).
- `packages/cli/src/services/skill/installer/skill-installer.service.ts` — `addAllSkills`: `prepareInstallableRegistry` (merged registry → cached clone with pull / shallow-clone fallback, or live `file://` root — never the search index), `discoverRegistrySkills`, exclude filter, >20 confirm callback, dry-run target check, per-skill try/catch loop over the existing `installResolvedSkill` core, aggregation via `summarizeAddAll`.
- `packages/cli/src/services/skill/skill.service.ts` — `addAllSkills` passthrough.
- `packages/cli/src/commands/skill/skill.command.ts` — `--all`, `--exclude <glob>`, `--dry-run`, `--json` flags; `--all`+positional error; confirm callback that checks `isInteractiveTerminal()` before prompting (non-TTY never prompts); `process.exitCode = 1` when `failed > 0`; cancellation → warning + exit 0.
- `packages/cli/src/commands/skill/skill.render.ts` — `renderSkillAddAllResult`: dry-run "would install" table, install summary (`installed` / `skipped (already installed)` / `failed` + error details), `--json` via `JSON.stringify(result, null, 2)`.

## Deviations from design

- None material. Dry-run items reuse the `installed`/`skipped` statuses (with `dryRun: true` on the result) so scripts can diff dry-run vs real-run output; the human renderer labels them "would install".

## Built-in path

`--built-in` branch untouched (curated loop over `getBuiltinSkillNames`); unit test asserts it never routes through `addAllSkills`.
