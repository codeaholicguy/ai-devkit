---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- Unit coverage for new readiness API behavior and CLI status integration.
- Integration scope covers report assembly and terminal rendering with all adapters.
- No browser or deployment E2E is needed.
- Performance validation is structural: independent checks run concurrently via `Promise.all`.

## Unit Tests
**What individual components need testing?**

### Agent Readiness
- [x] Reports readiness-supported adapters and omits `gemini_cli`.
- [x] Checks executable, global config, and built-in skills for every adapter.
- [x] Reports built-in skill counts as informational readiness.
- [x] Includes Codex and Claude hook integration checks only for those adapters.
- [x] Includes Pi plugin/session tracker integration check only for Pi.
- [x] Parses Pi configured providers without leaking auth values.
- [x] Parses OpenCode auth list output into available provider names.
- [x] Reports Copilot auth when GitHub CLI authentication is active.
- [x] Treats stale Pi mapping entries as non-failing.
- [x] Covers OpenCode auth parsing with colored CLI output.

### CLI Status
- [x] Assembles dynamic agent readiness reports from `agent-manager`.
- [x] Counts only pass/warn/fail checks in aggregate totals.
- [x] Renders human `pass` statuses as `ready` and `warn` statuses as `not ready`.
- [x] Reports missing project `.ai-devkit.json` as warning-level readiness.
- [x] Renders `Agents:` and `Checks:` tables for all reported adapters.
- [x] Omits adapters without executables from human `Agents:` and `Checks:` tables.
- [x] Excludes adapters without executables from scored readiness totals.
- [x] Does not print separate missing built-in skill warning lines in human output.
- [x] Keeps registries and channels informational.

## Integration Tests
**How do we test component interactions?**

- [x] Status service accepts injected file/command/auth helpers and produces deterministic reports.
- [x] Status renderer displays Pi providers as an informational row.
- [x] CLI status service tests avoid duplicating provider-specific adapter assertions owned by `agent-manager`.

## End-to-End Tests
**What user flows need validation?**

- [x] Manual smoke: `node packages/cli/dist/cli.js status` ran against the local environment after build.

## Test Data
**What data do we use for testing?**

- In-memory `readFile`, `access`, and `runCommand` fakes.
- Fixture home paths for adapter config directories, built-in skills, hooks, and Pi auth.

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- Targeted Vitest commands and package builds are sufficient for this refactor.
- Feature lint must pass after docs are updated.

## Manual Testing
**What requires human validation?**

- Review terminal output shape manually from renderer tests or local CLI output.

## Performance Testing
**How do we validate performance?**

- Confirm top-level status service checks and per-agent readiness checks are parallelized.

## Bug Tracking
**How do we manage issues?**

- Any failing targeted test blocks completion until fixed.
