---
phase: planning
title: Project Planning & Task Breakdown
description: Implementation plan for deterministic feature-document initialization command
---

# Project Planning & Task Breakdown

## Milestones
- [x] Milestone 1: CLI command shape and feature-doc creation service are defined and tested
- [x] Milestone 2: `docs init-feature` creates deterministic date-prefixed phase docs
- [x] Milestone 3: Lifecycle command guidance delegates scaffolding to the CLI and preserves fallback behavior

## Task Breakdown

### Phase 1: Foundation
- [x] Task 1.1: Add tests for local date formatting, including month/day zero-padding and avoiding UTC `toISOString()` behavior
- [x] Task 1.2: Add or reuse feature-name validation for command input (`name` and optional `feature-` prefix)
- [x] Task 1.3: Add `TemplateManager` tests for creating all phase docs from `README.md` templates with date-prefixed filenames
- [x] Task 1.4: Decide and document duplicate behavior: fail before writing, skip existing, or require `--force`

### Phase 2: Core Command
- [x] Task 2.1: Implement `TemplateManager.copyFeatureDocTemplates(featureName, options)`
- [x] Task 2.2: Implement `packages/cli/src/commands/docs.ts` with `init-feature <name>`
- [x] Task 2.3: Register `docs` command namespace in `packages/cli/src/cli.ts`
- [x] Task 2.4: Resolve docs dir from config, falling back to default `docs/ai`
- [x] Task 2.5: Add command tests for success, invalid name, configured docs dir, existing files, and current-date behavior

### Phase 3: Workflow Integration
- [x] Task 3.1: Update `/new-requirement` templates to run `npx ai-devkit@latest docs init-feature <name>` before filling docs
- [x] Task 3.2: Update follow-up command templates to use returned paths or latest matching `YYYY-MM-DD-feature-{name}.md` docs with legacy fallback
- [x] Task 3.3: Update lifecycle skill references to describe the CLI-owned scaffold step and older-CLI fallback
- [x] Task 3.4: Keep or refine lint resolver tests for date-prefixed docs and legacy fallback
- [x] Task 3.5: Align command files, install templates, and dev-lifecycle references on concise date-prefixed doc guidance
- [x] Task 3.6: Make feature-doc initialization and lint use `.ai-devkit.json` phases instead of a hardcoded phase list

### Phase 4: Verification
- [x] Task 4.1: Run focused command and TemplateManager tests
- [x] Task 4.2: Run full `packages/cli` test suite
- [x] Task 4.3: Run `npx tsc --noEmit` for `packages/cli`
- [x] Task 4.5: Verify command files match install templates after `docs/ai` to `{{docsDir}}` normalization
- [x] Task 4.6: Add and pass focused tests for config-driven phases in docs initialization and lint
- [ ] Task 4.4: Run `npx ai-devkit@latest lint --feature docs-init-feature-command` after branch/doc state is ready (docs pass; blocked by missing branch `feature-docs-init-feature-command` in current workspace)

## Dependencies
- Existing `TemplateManager` phase template paths.
- Existing `ConfigManager.getDocsDir()` behavior.
- Existing lint feature-name normalization/validation.
- Commander command registration pattern.
- Existing command template install/copy flow.

## Timeline & Estimates
- Foundation and tests: 0.5 day
- Core command implementation: 0.5-1 day
- Workflow template updates: 0.25 day
- Verification and cleanup: 0.25 day

Total estimate: 1.5-2 days, depending on duplicate-file behavior and whether `--json` ships in the first pass.

## Risks & Mitigation
- Risk: installed skills call a command that older CLI versions do not have.
  - Mitigation: command guidance should say "when available" or include manual fallback for older CLIs.
- Risk: date generation uses UTC accidentally.
  - Mitigation: unit test local date formatter and avoid `toISOString()`.
- Risk: partial writes if one phase target already exists.
  - Mitigation: preflight all target paths before copying, or clearly implement skip semantics.
- Risk: duplicating feature-name validation between lint and docs command.
  - Mitigation: move shared helpers into a neutral utility if imports become cyclic or semantically odd.
- Risk: current prompt/template updates get ahead of the CLI command.
  - Mitigation: ship command and template updates together, or phrase template guidance with fallback until release.

## Resources Needed
- Local CLI test suite.
- Existing phase README templates.
- Maintainer decision on duplicate-file behavior and `--json` scope.
