---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones

- [x] M1: Docs (requirements seed → design → this plan)
- [x] M2: Core implementation (types, service, installer, command, render)
- [x] M3: Unit tests
- [x] M4: E2E fixture tests + gates
- [x] M5: Review, commit, PR

## Task Breakdown

### Phase 1: Core

- [x] 1.1 `skill.types.ts`: `AddAllSkillOptions`, `AddAllSkillItem`, `AddAllSkillsResult`
- [x] 1.2 `skill-installer.service.ts`: `addAllSkills` — prepare registry (cached clone / shallow-clone fallback / local `file://`), `discoverRegistrySkills`, exclude glob, per-skill try/catch loop over `installResolvedSkill`, dry-run short-circuit, aggregate counts
- [x] 1.3 `skill.service.ts`: `addAllSkills` passthrough
- [x] 1.4 `skill.command.ts`: `--all`, `--dry-run`, `--json`, `--exclude <glob>` flags; exclusivity error (`--all` + positional); TTY>20 confirm guard; non-zero exit on failures
- [x] 1.5 `skill.render.ts`: `renderSkillAddAllResult` table + JSON rendering

### Phase 2: Tests

- [x] 2.1 Unit: flag exclusivity, dry-run no-install, JSON shape, exclude filtering, skip counting, failure exit code, `--built-in` unchanged
- [x] 2.2 Installer unit tests for `addAllSkills` aggregation (installed/skipped/failed/dry-run)
- [x] 2.3 E2E `e2e/skill-add-all.e2e.ts`: temp `file://` registry with 3 skills → `--all` 3 installs; rerun 3 skips; `--exclude` 2; `--dry-run` 0 installs; `--json` parseable; `--all` + name errors

### Phase 3: Gates & Ship

- [x] 3.1 Scoped unit tests + `npm run lint` + `npm test` + `npm run test:e2e`
- [x] 3.2 dev-review checklist; post-commit `git show --stat`; pre-push `git ls-tree`
- [x] 3.3 Commit + push branch + PR (unmerged)

## Dependencies

- 1.2 depends on 1.1; 1.4 on 1.3/1.5; 2.x on 1.x; 3.x on 2.x. E2E needs `packages/cli` built (`dist/cli.js`).

## Timeline & Estimates

- Single-session implementation; ~1 day total including gates.

## Risks & Mitigation

- Confirm-guard placement must precede any mutation; mitigated by ordering guard before install loop and unit-testing the non-TTY path.
- Dry-run must not write `.ai-devkit.json` skills entries; mitigated by bypassing config writes entirely in dry-run and asserting config unchanged in E2E.
- Glob semantics: keep to `*`/`?` (names are `[a-z0-9-]`); document in help text.
