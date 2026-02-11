---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- Unit test coverage target (default: 100% of new/changed code)
- Integration test scope (critical paths + error handling)
- End-to-end test scenarios (key user journeys)
- Alignment with requirements/design acceptance criteria

## Unit Tests
**What individual components need testing?**

### Component/Module 1
- [ ] Test case 1: `SetupPlanner` creates deterministic operations for same input
- [ ] Test case 2: `SetupPlanner` emits conflict operations for existing modified files
- [ ] Additional coverage: fingerprint comparison and skip logic

### Component/Module 2
- [ ] Test case 1: Tool adapters return expected capability/path mappings
- [ ] Test case 2: Unsupported tool capabilities are rejected gracefully
- [ ] Additional coverage: profile recommendation defaults and overrides

## Integration Tests
**How do we test component interactions?**

- [ ] Integration scenario 1: `ai-devkit setup` interactive quickstart applies selected tools/assets
- [ ] Integration scenario 2: `--dry-run` shows plan and writes no files
- [ ] API endpoint tests
- [ ] Integration scenario 3 (failure mode / rollback): write permission denied for one target, other operations continue, report contains partial failures

## End-to-End Tests
**What user flows need validation?**

- [ ] User flow 1: First-time user configures Codex + Claude via wizard
- [ ] User flow 2: Existing user reruns setup and only drifted files update
- [ ] Critical path testing
- [ ] Regression of adjacent features

## Test Data
**What data do we use for testing?**

- Test fixtures and mocks
  - Mock home directories and per-tool config trees
  - Mock template files for commands/skills/instruction docs
- Seed data requirements
  - Pre-existing user-modified files to validate overwrite/backup logic
- Test database setup
  - Not applicable (local file-based state only)

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- Coverage commands and thresholds (`npm run test -- --coverage`)
- Coverage gaps (files/functions below 100% and rationale)
- Links to test reports or dashboards
- Manual testing outcomes and sign-off

## Manual Testing
**What requires human validation?**

- UI/UX testing checklist (include accessibility)
  - Wizard step clarity, keyboard-only flow, and confirmation readability
  - Clear overwrite warnings and success/failure summaries
- Browser/device compatibility
  - Not applicable
- Smoke tests after deployment
  - `npx ai-devkit setup` (interactive)
  - `npx ai-devkit setup --dry-run`
  - `npx ai-devkit setup --non-interactive --profile quickstart --tools codex,claude`

## Performance Testing
**How do we validate performance?**

- Load testing scenarios
  - Large template sets across multiple tools
- Stress testing approach
  - Repeated reruns to validate state-driven fast path behavior
- Performance benchmarks
  - Wizard initialization <2s, dry-run <1s on warm state, first run <5min

## Bug Tracking
**How do we manage issues?**

- Issue tracking process
  - Open GitHub issue with command flags, OS, repro, expected/actual
- Bug severity levels
  - Blocker, major, minor, cosmetic
- Regression testing strategy
  - Re-run setup integration suite on any change to adapters/planner/executor

