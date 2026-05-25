---
phase: testing
title: Testing Strategy
description: Testing plan for deterministic feature-document initialization command
---

# Testing Strategy

## Test Coverage Goals
- Unit test coverage target: 100% of new/changed command and helper code.
- Integration scope: command handler to `TemplateManager` behavior through mocked dependencies.
- Regression scope: lint continues accepting legacy and date-prefixed docs.

## Unit Tests

### Date Formatting
- [x] Formats local dates as `YYYY-MM-DD`
- [x] Zero-pads single-digit months and days
- [x] Does not use UTC `toISOString()` semantics by using local date getters
- [x] Keeps date selection internal to current local date

### TemplateManager Feature Docs
- [x] Creates one doc per configured phase
- [x] Preserves template file content and frontmatter by copying phase templates directly
- [x] Uses configured docs dir
- [x] Fails all-or-nothing when existing target files conflict
- [x] Returns created file paths in phase order

### Docs Command
- [x] Registers `docs init-feature <name>`
- [x] Validates feature names and optional `feature-` prefix
- [x] Uses config docs dir by default
- [x] Uses current local date
- [x] Does not expose a date flag
- [x] Prints created paths for agent consumption
- [x] Supports `--json` output for automation
- [x] Passes `.ai-devkit.json` phases to feature-doc creation

## Integration Tests
- [x] Run command against a temporary project with initialized docs templates
- [x] Verify generated files exist at date-prefixed paths
- [x] Verify docs initialization and lint honor configured phases, including non-default phases
- [ ] Verify `lint --feature <name>` passes for generated docs when branch state is satisfied

## End-to-End Tests
- [ ] Simulate `/new-requirement` flow: gather feature name, run docs initializer, fill generated requirements/design/planning docs
- [ ] Confirm follow-up commands can reference returned paths or latest matching `YYYY-MM-DD-feature-{name}.md` docs

## Test Data
- Temporary project root with `docs/ai/{phase}/README.md`
- Fixed fake-clock date in tests: `2026-05-24`
- Feature names:
  - `user-authentication`
  - `feature-user-authentication`
  - invalid `user authentication`

## Test Reporting & Coverage
- `npx jest --config jest.config.js --runInBand` from `packages/cli`: 36 suites passed, 574 tests passed.
- `npx tsc --noEmit` from `packages/cli`: exit 0.
- `npx ai-devkit@latest lint` from repo root: base docs all passed.
- Command/template sync check: all `commands/*.md` files match `packages/cli/templates/commands/*.md` after normalizing `docs/ai` to `{{docsDir}}`.
- Manual smoke command in `/private/tmp`: `docs init-feature smoke-test --json` created date-prefixed docs.

## Manual Testing
- Manually run `npx ai-devkit@latest docs init-feature docs-init-feature-command` in a disposable test repo after implementation.
- Check generated filenames match the local current date.
- Check existing docs are not overwritten.

## Performance Testing
- Not required beyond normal unit/integration tests; the command performs bounded local file operations.

## Bug Tracking
- Track regressions against GitHub issue #41 or the corresponding implementation PR.
