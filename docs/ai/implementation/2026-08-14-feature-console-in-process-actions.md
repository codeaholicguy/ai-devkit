---
phase: implementation
title: Console In-Process Actions Implementation
description: Implementation log for shared action services
---

# Console In-Process Actions Implementation

## Status

Implementation and local validation complete; publication pending.

## Intended Changes

- `services/agent/agent-action.service.ts` centralizes start/open/send/kill/rename orchestration and constructs the existing manager, terminal, tmux, registry, print-agent, and group dependencies by default.
- `services/channel/channel-action.service.ts` centralizes foreground/daemon channel start and channel stop while preserving the dedicated daemon launch.
- Commander resolves paths and message input, calls the service, and applies only an explicit service exit directive.
- `runAction.ts` dispatches all seven console actions directly to injectable service methods; it no longer imports `child_process`.
- `pendingAction.ts` provides synchronous action identity/label notification and a keyed in-flight gate shared by all console flows.
- `ConsoleApp` publishes pending labels through the existing transient message surface. Required labels are `Sending`, `Opening`, and `Stopping channel`.

## Decisions and Deviations

- All seven actions fit coherently in the shared boundary; no action migration was deferred.
- Group, print, wait, and foreground-channel orchestration also moved into the services, making Commander thinner than the minimum design while preserving their existing tests and output.
- The configured Vercel React best-practices skill was unavailable in the active skill catalog. The implementation follows existing hook extraction, stable setter, memoized executor, and synchronous mutable-gate patterns; no render-time side effects or timing assertions were added.
- The channel daemon remains an intentional detached child process. Only the per-action full CLI respawn was removed.

## Validation Evidence

- Red: focused action tests failed with seven zero-call assertions against the subprocess runner; pending tests failed because the pending module/mapping did not exist.
- Green/refactor: `npm test --workspace packages/cli -- src/__tests__/commands/agent.test.ts src/__tests__/commands/channel.test.ts src/__tests__/tui/console/actions/runAction.test.ts src/__tests__/tui/console/actions/pendingAction.test.ts` — 4 files, 114 tests passed.
- Focused console actions/hooks: 5 files, 33 tests passed.
- Full CLI: `npm test --workspace packages/cli` — 82 files, 975 tests passed after rebasing onto `origin/main`.
- CLI lint: `npm run lint --workspace packages/cli` — exit 0, five existing warnings and no errors.
- CLI build: `npm run build --workspace packages/cli` — exit 0, 199 files compiled after rebase.
- Feature docs: `npx ai-devkit@latest lint --feature console-in-process-actions` — all checks passed.
- Output isolation: default console services receive a silent reporter; a red-to-green test proves CLI spinners/text cannot write into the Ink terminal.
