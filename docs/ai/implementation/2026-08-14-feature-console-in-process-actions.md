---
phase: implementation
title: Console In-Process Actions Implementation
description: Implementation log for shared action services
---

# Console In-Process Actions Implementation

## Status

Implementation, validation, and publication for review are complete. PR: https://github.com/codeaholicguy/ai-devkit/pull/160

## Intended Changes

- `@ai-devkit/agent-manager` exports the reusable start/open/send/kill/rename service and its existing lower-level operations. The CLI keeps only a dependency-composition adapter for prompts, groups, debug logging, and terminal reporting.
- `@ai-devkit/channel-connector` exports bridge registry and daemon start/stop services. The CLI keeps foreground execution and source/build daemon-entrypoint resolution as CLI-specific adapters.
- Commander resolves paths and message input, calls the service, and applies only an explicit service exit directive.
- `runAction.ts` dispatches all seven console actions directly to injectable service methods; it no longer imports `child_process`.
- `pendingAction.ts` provides synchronous action identity/label notification and a keyed in-flight gate shared by all console flows.
- `ConsoleApp` publishes pending labels through the existing transient message surface. Required labels are `Sending`, `Opening`, and `Stopping channel`.

## Decisions and Deviations

- All seven actions fit coherently in the shared boundary; no action migration was deferred.
- Group, print, and wait orchestration moved into the agent package service. Foreground-channel execution remains in the CLI adapter because it owns the long-running Commander process, while daemon start/stop is package-owned and shared with the console.
- The configured Vercel React best-practices skill was unavailable in the active skill catalog. The implementation follows existing hook extraction, stable setter, memoized executor, and synchronous mutable-gate patterns; no render-time side effects or timing assertions were added.
- The channel daemon remains an intentional detached child process. Only the per-action full CLI respawn was removed.
- Remaining compatibility modules under `packages/cli/src/services` are export-only shims; service behavior has one implementation in the owning packages. The console imports the package APIs directly.

## Validation Evidence

- Red: focused action tests failed with seven zero-call assertions against the subprocess runner; pending tests failed because the pending module/mapping did not exist.
- Green/refactor: `npm test --workspace packages/cli -- src/__tests__/commands/agent.test.ts src/__tests__/commands/channel.test.ts src/__tests__/tui/console/actions/runAction.test.ts src/__tests__/tui/console/actions/pendingAction.test.ts` — 4 files, 114 tests passed.
- Focused console actions/hooks: 5 files, 33 tests passed.
- Full CLI: `npm test --workspace packages/cli` — 82 files, 975 tests passed after rebasing onto `origin/main`.
- CLI lint: `npm run lint --workspace packages/cli` — exit 0, five existing warnings and no errors.
- CLI build: `npm run build --workspace packages/cli` — exit 0, 199 files compiled after rebase.
- Feature docs: `npx ai-devkit@latest lint --feature console-in-process-actions` — all checks passed.
- Output isolation: default console services receive a silent reporter; a red-to-green test proves CLI spinners/text cannot write into the Ink terminal.
- Owning packages: agent-manager 25 files/504 tests and channel-connector 8 files/105 tests passed; both package builds and lints passed.
