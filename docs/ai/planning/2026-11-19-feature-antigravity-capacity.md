---
phase: planning
title: Implementation Plan & Task Breakdown
description: Ordered implementation tasks traceable to requirements, design, and test scenarios
---

# Implementation Plan & Task Breakdown

## Milestone 1: Provider Parser & Failure Classification (`@ai-devkit/agent-manager`)

- [x] **T1. Create `packages/agent-manager/src/capacity/providers/antigravity.ts` (TDD)**
  - **Outcome**: Pure `parseAntigravityVersion`, `isSupportedAntigravityVersion`, `parseAntigravityUsageReport`, `classifyAntigravityExitFailure`, and `AntigravityCliError`.
  - **Validation evidence**: `packages/agent-manager/tests/capacity/antigravity.test.ts` parser & classification tests green.

## Milestone 2: Subprocess Source, Safeguards & Public Export (`@ai-devkit/agent-manager`)

- [x] **T2. Create `packages/agent-manager/src/capacity/sources/antigravity.ts` (TDD)**
  - **Outcome**: `probeAntigravityCapacity` with authoritative `ANTIGRAVITY_CLI_PATH` / `PATH` / well-known path resolution, in-process `(path, size, mtimeMs, ino)` version cache, `0700` temp cwd with failing `open`/`xdg-open` stubs + `BROWSER` + `AGY_CLI_DISABLE_AUTO_UPDATE=true`, `90s` timeout + `1 MiB` output cap + process-group reaping, and auth-required → unauthenticated report conversion.
  - **Validation evidence**: `packages/agent-manager/tests/capacity/antigravity.test.ts` source & real-subprocess tests green (17/17).

- [x] **T3. Wire `getAntigravityCapacityReport` in `packages/agent-manager/src/capacity/index.ts` and `packages/agent-manager/src/index.ts`**
  - **Outcome**: Public `@ai-devkit/agent-manager` export `getAntigravityCapacityReport` and `AntigravityCapacityOptions`.
  - **Validation evidence**: `packages/agent-manager/tests/capacity/index.test.ts` (3/3) and `nx run agent-manager:build` green.

## Milestone 3: CLI Integration & Rendering (`@ai-devkit/cli`)

- [x] **T4. Register `antigravity` (and `agy` alias) in `packages/cli/src/commands/capacity.ts` and `packages/cli/src/commands/capacity/render.ts` (TDD)**
  - **Outcome**: `ai-devkit capacity`, `ai-devkit capacity antigravity`, and `ai-devkit capacity agy` support table and `--json` output with `"Antigravity"` provider label.
  - **Validation evidence**: `packages/cli/tests/commands/capacity/command.test.ts` (18/18) green.

## Milestone 4: Verification, Smoke Test & Review

- [x] **T5. Full build, test suite, lint, simplify analysis, CLI smoke test, and final review**
  - **Outcome**: Fresh verification evidence across build, lint, capacity tests, package test suites, and real built CLI smoke test.
  - **Validation evidence**: `nx run-many -t build -p agent-manager,cli`, `npm run lint`, `vitest run`, `dev-smoke` (4/4 checks), and `ai-devkit lint --feature antigravity-capacity` all green.

- [x] **T6. Performance follow-ups & doc sync**
  - **Outcome**: Parallelize `capacityCommand` provider probing (`Promise.allSettled`), add direct Cloud Code OAuth fast path (`harnesses/antigravity/credentials.ts` + `fetchAntigravityRemoteCapacity`) with automatic fallback to `agy -p /usage`, and update public + feature docs.
  - **Validation evidence**: Commits `4c1b5c03` and `fbf208c4`, 43/43 capacity/CLI tests green, and `ai-devkit lint --feature antigravity-capacity` green.

## Summary

All planned milestones (T1–T6) are complete with zero blockers. The feature is verified end-to-end against the built CLI binary and documented across both public docs and feature AI docs.
