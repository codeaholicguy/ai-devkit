---
phase: testing
title: Complete Project Initialization Testing
description: TDD and integration coverage for shared project application
---

# Complete Project Initialization Testing

## Coverage Goal

Cover every new shared-application and MCP coordination branch. Use real temporary filesystems for critical flows; mock registry/network and prompts.

## Approved Scenarios

- [x] Complete template init creates config/docs, delegates project skills, and creates all supported MCP target files.
- [x] Plain interactive init applies accepted built-in skills.
- [x] `--yes` performs no prompts, including MCP conflict handling.
- [x] Second init/install reports matches without rewriting phase or MCP content.
- [x] Existing phase docs survive install and template init by default.
- [x] Interactive approval and `--overwrite` replace phase docs.
- [x] MCP conflicts fail non-interactively unless `--overwrite` is passed.
- [x] Malformed MCP files fail without replacement.
- [x] Skill and MCP failures exit nonzero with incomplete copy.
- [x] `--config` input is applied into the canonical project config by the shared service.
- [x] Claude plus GitHub performs one coherent `.mcp.json` merge.
- [x] Existing setup tests retain machine-global scope while init tests assert project application.
- [x] Environment help no longer advertises the stale three-value set.

## Regression Coverage

- [x] Preserve unrelated MCP servers/top-level keys and additive deletion behavior.
- [x] Preserve flags and `name`/`skill` config aliases.
- [x] Installed/matched-only runs exit 0; required conflicts/failures exit 1.

## Validation Evidence

Focused service/command/MCP/SkillManager suites passed during TDD. A built-CLI smoke run of `init --template ... --yes` created config, requirements docs, and seven physical MCP target files in one command; rerun preserved the phase and matched all MCP files. Final workspace validation evidence is recorded after the final commands below.

- `npm run build` — exit 0; Nx built all 6 projects.
- `npm test` — exit 0; Nx tested all 6 projects: 154 files and 2,030 tests passed.
- `npm run lint` — exit 0; Nx linted all 6 projects. Three pre-existing unused-catch warnings remain in untouched files (`memory/search.ts`, `cli/channel.ts`, `cli/util/skill.ts`); no errors or warnings in changed files.
