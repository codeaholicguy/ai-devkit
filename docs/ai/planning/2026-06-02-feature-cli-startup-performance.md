---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
feature: cli-startup-performance
---

# Project Planning & Task Breakdown

## Milestones

- [x] Milestone 1: Establish benchmark baseline and command import boundaries.
- [x] Milestone 2: Introduce lightweight CLI bootstrap and lazy command dispatch.
- [x] Milestone 3: Measure lazy-dispatch performance and conditionally restructure or bundle build output if needed to reach `<50 ms` p50.
- [x] Milestone 4: Add tests, CI benchmark gate, and documentation.

## Task Breakdown

### Phase 1: Benchmark Foundation

- [x] Task 1.1: Add a local benchmark script for direct built CLI execution with at least 20 iterations per case.
- [x] Task 1.2: Include root `--version`, root `--help`, every top-level command `--help`, and representative real command cases.
- [x] Task 1.3: Capture current built CLI baseline in benchmark output for comparison.
- [x] Task 1.4: Add temporary workspace/config helpers for `lint`, `memory search`, and no-agent `agent list --json` smoke cases.

### Phase 2: Lightweight Bootstrap

- [x] Task 2.1: Split root CLI bootstrap from command handler modules.
- [x] Task 2.2: Move top-level command metadata into lightweight registration code.
- [x] Task 2.3: Add lazy dispatch for each top-level command group. Subcommand-level handler splitting remains a possible follow-up inside heavy groups such as `agent` and `channel`.
- [x] Task 2.4: Refactor heavy command-module imports so help/version paths do not load `ink`, `react`, `inquirer`, `telegraf`, `@ai-devkit/agent-manager`, or `@ai-devkit/memory`.
- [x] Task 2.5: Preserve existing command tests by updating mocks around lazy imports where needed.

### Phase 3: Build/Runtime Optimization

- [x] Task 3.1: Run benchmark after lazy bootstrap to see whether p50 `<50 ms` is met.
- [x] Task 3.2: If lazy metadata/dispatch does not meet `<50 ms` p50, add generated or bundled `dist` output using existing repo tooling only, with no dependency additions. Not needed because lazy dispatch meets the startup/help target.
- [x] Task 3.3: Preserve shebang/bin behavior for `dist/cli.js`.
- [x] Task 3.4: Preserve template copy behavior and channel-daemon launch paths.
- [x] Task 3.5: Add source maps or clear generated-file provenance for debugging. No generated/bundled output was introduced, so no additional source-map work was needed.

### Phase 4: Verification and CI

- [x] Task 4.1: Add unit tests for metadata registration and lazy action loading.
- [x] Task 4.2: Add integration tests for built CLI help/version and representative commands.
- [x] Task 4.3: Add CI benchmark gate with p50 `<50 ms` for required startup/help cases.
- [x] Task 4.4: Run `npm run build`, `npm test -w packages/cli`, `npm run test:e2e`, and benchmark gate.
- [x] Task 4.5: Update README or package docs only if maintainers need to know the benchmark command or build change. Feature docs were updated; README/package docs are not needed because the benchmark is internal CI/maintainer tooling.

## Dependencies

- Task 1.1 must land before enforcing performance claims.
- Phase 2 depends on understanding existing command registration and test mocks.
- Phase 3 is conditional: only do bundling/generated output if Phase 2 does not hit the target.
- CI gate depends on benchmark script stability.

## Timeline & Estimates

- Benchmark foundation: 0.5 day.
- Lazy bootstrap and import-boundary refactor: 1-1.5 days.
- Conditional build optimization: 0.5-1.5 days depending on whether bundling is needed.
- Tests and CI gate: 0.5-1 day.
- Total estimate: 2.5-4.5 days.

## Risks & Mitigation

- **Risk:** `<50 ms` p50 is not achievable with native Node ESM and no new dependencies.
  - **Mitigation:** Allow generated/bundled `dist` using existing tooling; if still impossible, report measured floor before changing scope.
- **Risk:** Lazy imports change Commander help, option parsing, or error behavior.
  - **Mitigation:** Add help/output and command action regression tests before broad refactor.
- **Risk:** CI performance gate flakes on shared runners.
  - **Mitigation:** Use repeated sampling, p50 threshold, warm-up if needed, and direct built CLI execution.
- **Risk:** Build restructuring breaks package install, shebang, templates, or channel daemon paths.
  - **Mitigation:** Include focused integration/e2e coverage for `dist/cli.js`, init/template behavior, and daemon path resolution.
- **Risk:** Existing tests mock modules before import and may fail with dynamic imports.
  - **Mitigation:** Update tests to mock lazy targets explicitly and keep handler functions independently testable.

## Resources Needed

- Existing npm workspace and lockfile.
- Existing Node/Vitest/Nx tooling.
- CI workflow access to add the benchmark gate.
- Measured baseline from the June 2, 2026 startup investigation.

## Phase 5 Status Summary

All planned implementation tasks needed for the `<50 ms` startup/help target are complete. The feature added a local startup benchmark, CI benchmark gate, lightweight static help/version bootstrap, lazy top-level command dispatch, focused unit tests, and feature documentation. The measured startup/help p50 target is met without generated or bundled `dist` output, so build restructuring remains unnecessary. Remaining work moves to Phase 6 implementation review, then Phase 7 test coverage review and Phase 8 code review.
