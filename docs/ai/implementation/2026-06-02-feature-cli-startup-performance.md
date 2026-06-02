---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
feature: cli-startup-performance
---

# Implementation Guide

## Development Setup

- Work in branch/worktree `feature-cli-startup-performance`.
- Run `npm ci` in the feature worktree before phase work.
- Run `npm run build` before benchmark commands so measurements use `packages/cli/dist/cli.js`.

## Code Structure

Expected touch points:

- `packages/cli/src/cli.ts`: root bootstrap and command registration.
- `packages/cli/src/commands/*.ts`: command metadata/action split and lazy handler imports.
- `packages/cli/src/__tests__/commands/*.test.ts`: command behavior regression tests.
- `e2e/`: built CLI smoke coverage if bootstrap/build changes affect published behavior.
- CI workflow files if benchmark gate is added there.

Current implementation deltas:

- `packages/cli/src/util/cli-benchmark.ts`: local startup benchmark utility and executable built script entrypoint.
- `packages/cli/src/__tests__/util/cli-benchmark.test.ts`: TDD coverage for timing stats, failure accounting, required benchmark case list, and built-script root resolution.
- `packages/cli/src/cli-command-manifest.ts`: shared lightweight top-level command manifest used by static help and lazy dispatch.
- `packages/cli/src/__tests__/util/cli-command-manifest.test.ts`: coverage proving the manifest drives root help, command help, and dispatch paths.
- `packages/cli/src/cli-runtime.ts`: lightweight static help rendering and lazy top-level command execution.
- `packages/cli/src/__tests__/util/cli-runtime.test.ts`: TDD coverage for lightweight help/version, dispatch mapping, and lazy command registration.
- `packages/cli/src/cli.ts`: thin bootstrap that handles static help/version and delegates real commands to the lazy dispatcher.
- `packages/cli/package.json`: `benchmark:startup` script running `node dist/util/cli-benchmark.js`.
- `.github/workflows/ci.yml`: CI benchmark step after build.

## Phase 6 Implementation Check

Alignment with the design:

- The root entrypoint now imports only package metadata plus lightweight bootstrap/dispatch helpers before command selection.
- Root `--version`, root `--help`, and top-level command `--help` paths are served from static metadata and do not load the previous heavy command graph.
- Real command execution imports only the selected top-level command module before Commander parsing.
- Unknown command routing uses a lightweight Commander program populated from the shared manifest, preserving the existing unknown-command error without eager command-module imports.
- The startup benchmark runs locally and in CI after build, with the `<50 ms` p50 gate enforced for version/help paths.

Deviations and follow-ups:

- Static help metadata duplicates command names/descriptions and selected option metadata. This is the main drift risk versus Commander-generated help and should be reviewed when commands change.
- Lazy loading is currently at the top-level command group boundary. Heavy subcommand-specific dependencies inside groups such as `agent` and `channel` can be split further later, but this was not required to meet the startup/help target.
- Representative real commands are smoke-measured in the benchmark table, but CI does not enforce a `10%` real-command regression threshold because there is no stored baseline in this implementation.

## Phase 8 Code Review Notes

- Reviewed the lightweight help metadata against real command registration. Fixed two public help parity gaps found during review: option-bearing command help now includes command-specific flags for `init`, `setup`, `lint`, and `install`; `channel --help` now includes `stop [name]`.
- Refactored the runtime to expose `registerSelectedCommand` for direct branch coverage, while keeping `runSelectedCommand` as the CLI entrypoint dispatch API.
- Verified exported helper usage with `rg`: new APIs are referenced only by `cli.ts`, tests, benchmark script entrypoint, and feature docs.
- No new runtime dependencies, config keys, migrations, or irreversible state changes were introduced.

## Simplification Pass

- Consolidated top-level command metadata into `cli-command-manifest.ts`, so adding or changing a top-level command has one lightweight metadata entry used by both help rendering and dispatch resolution.
- Removed the source `cli-full.ts` eager fallback. Unknown command handling now builds a lightweight Commander shell from the manifest, avoiding a second full command graph.
- Consolidated `cli-bootstrap.ts` and `cli-dispatch.ts` into `cli-runtime.ts`, keeping one runtime module for help rendering and lazy command execution.
- Updated the CLI entrypoint to fast-path `--version` before importing runtime code.
- Added manifest tests to guard against future drift between root help, command help, and dispatch.

## Implementation Notes

### Core Features

- Keep root bootstrap lightweight. Avoid top-level imports of heavy command modules.
- Keep help-visible command metadata available without importing handler dependencies.
- Import command handlers dynamically only when a command action actually runs.
- Implement static command metadata plus lazy dispatch as the first optimization step.
- Introduce generated or bundled `dist` output only after benchmarking proves the first step misses the `<50 ms` target.
- If generated or bundled output is introduced, keep the source architecture explicit and testable.

### Patterns & Best Practices

- Prefer small registration helpers over broad abstractions unless generated metadata becomes necessary.
- Preserve existing `withErrorHandler` behavior around async command actions.
- Keep command handler functions exported for direct unit testing.
- Do not introduce new dependencies.

## Integration Points

- `packages/cli/package.json` `bin.ai-devkit` must remain compatible.
- `packages/cli` build must continue copying `templates` into `dist/templates`.
- `channel-daemon` launch logic must still resolve dev and built paths correctly.
- Existing package imports from `@ai-devkit/agent-manager`, `@ai-devkit/memory`, and `@ai-devkit/channel-connector` should move behind lazy boundaries where possible.

## Error Handling

- Lazy import failures should surface as command failures with the same error handling conventions as existing commands.
- Benchmark failures should print the failing command, p50, threshold, iterations, and failed process count.
- Generated build failures should fail `npm run build` clearly.

## Performance Considerations

- Optimize for fresh process startup, not long-lived process warm paths.
- Avoid unnecessary JSON/config/file reads before command selection.
- Avoid loading TUI/React/Ink unless `agent console` runs.
- Avoid loading memory database code unless a memory action runs.
- Avoid loading Telegram/channel bridge code unless channel actions requiring them run.

Benchmark foundation evidence:

- `npm test -w packages/cli -- src/__tests__/util/cli-benchmark.test.ts` passed with 4 tests.
- `npm test -w packages/cli -- src/__tests__/util/cli-runtime.test.ts src/__tests__/util/cli-command-manifest.test.ts src/__tests__/util/cli-benchmark.test.ts` passed with 18 tests after the final simplification pass.
- `npm run build` passed for all 4 projects.
- `AI_DEVKIT_CLI_BENCHMARK_ITERATIONS=1 npm run benchmark:startup -w packages/cli` executed all 15 configured cases with `0` failures. This smoke run captures current unoptimized startup timings around `325-680 ms`, confirming the benchmark exposes the baseline regression target.
- After lightweight bootstrap, `npm run benchmark:startup -w packages/cli` with 20 iterations produced `0` failures. Startup/help p50 values were `24.070-25.226 ms`; `--version` p50 was `25.080 ms`.
- After top-level lazy dispatch and CI gate wiring, `npm run benchmark:startup -w packages/cli` with 20 iterations exited `0`. Startup/help p50 values were `29.391-33.132 ms`; real command smoke p50 values were `75.028 ms` for `lint`, `239.437 ms` for `agent-list-json`, and `153.793 ms` for `memory-search`.
- After the simplification pass, `npm run benchmark:startup -w packages/cli` with 20 iterations exited `0`. Startup/help p50 values were `24.085-25.149 ms`; real command smoke p50 values were `70.889 ms` for `lint`, `227.256 ms` for `agent-list-json`, and `149.253 ms` for `memory-search`.
- After moving runtime modules next to `cli.ts`, `npm run benchmark:startup -w packages/cli` with 20 iterations exited `0`. Startup/help p50 values were `24.290-26.318 ms`; real command smoke p50 values were `71.420 ms` for `lint`, `255.848 ms` for `agent-list-json`, and `149.797 ms` for `memory-search`.

## Security Notes

- Benchmark scripts must not read or print secrets.
- Channel and memory smoke tests should use temporary or project-isolated config paths.
- No Telegram tokens, tmux sessions, or external network calls should be required in CI.
