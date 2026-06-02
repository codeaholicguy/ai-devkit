---
phase: implementation
title: Agent Console Rename Implementation
description: Technical implementation notes for selected-agent rename support in agent console
---

# Implementation Guide

## Development Setup

- Current repository/branch: `/Users/hoangnguyen/Codeaholicguy/Code/ai-devkit` on `main`.
- User explicitly requested no worktree; branch/workspace isolation is reduced.
- Existing unrelated dirty file: `BACKLOG.md`; do not modify or revert it for this feature.
- Base docs lint passed before feature setup.
- Dependency bootstrap: `npm ci` completed successfully. The `husky` prepare step attempted to write `.git/config` and was blocked by sandbox permissions, but the command exited `0`.

## Code Structure

Primary implementation touchpoints:

| Area | File |
|---|---|
| Console shell/modes | `packages/cli/src/tui/console/ConsoleApp.tsx` |
| New rename workspace | `packages/cli/src/tui/console/RenameAgentPane.tsx` |
| Action contract | `packages/cli/src/tui/console/actions/types.ts` |
| Action runner | `packages/cli/src/tui/console/actions/runAction.ts` |
| Footer shortcut text | `packages/cli/src/tui/console/StatusFooter.tsx` |
| Action/pane tests | `packages/cli/src/__tests__/tui/console/**` |

## Implementation Notes

### Core Features

- Add a `rename-agent` workspace mode that stores the selected agent name at the time `r` is pressed.
- Implement `RenameAgentPane` with:
  - read-only current-name display,
  - editable new-name text field prefilled with the current name,
  - submit and cancel controls,
  - inline error text,
  - disabled/submitting state.
- Submit trims the entered name and shells out through `runAction`.
- On success, return to preview/chat mode and wait for the next normal agent-list poll.
- On failure, keep rename mode active and display the subprocess error.

### Patterns & Best Practices

- Follow the start-agent right-pane workspace pattern instead of adding an overlay or external prompt.
- Keep CLI `agent rename` as the behavior source of truth.
- Pass names as argv values to `spawn`; do not interpolate a shell command.
- Keep text/error clipping logic close to the pane, with pure helper tests where possible.

## Integration Points

- `runAction({ type: 'rename', currentName, newName })` maps to:

```ts
agent rename <currentName> <newName>
```

- The existing CLI command handles:
  - format validation,
  - same-name no-op,
  - not-found errors,
  - conflict errors,
  - stale-entry pruning,
  - atomic registry writes.

## Phase 4 Implementation Notes

### Completed Foundation

- `packages/cli/src/tui/console/actions/types.ts`: added `{ type: 'rename'; currentName: string; newName: string }` to `ConsoleAction`.
- `packages/cli/src/tui/console/actions/runAction.ts`: mapped rename to `agent rename <currentName> <newName>`.
- `packages/cli/src/__tests__/tui/console/actions/runAction.test.ts`: added rename argv coverage; focused test suite passes after the production change.

### Completed Console Workspace

- `packages/cli/src/tui/console/RenameAgentPane.tsx`: added native Ink rename workspace with current-name display, editable new-name field, submit/cancel controls, submitting state, and clipped error output.
- `packages/cli/src/tui/console/hooks/useRenameAgentPane.ts`: added rename lifecycle state and result handling. Success returns to preview and intentionally does not call `refresh()`.
- `packages/cli/src/tui/console/ConsoleApp.tsx`: added `rename-agent` right-pane mode, lowercase `r` shortcut, narrow-mode replacement behavior, and rename submit/cancel wiring.
- `packages/cli/src/tui/console/types.ts`: added `rename-agent` to `RightPaneMode`.
- `packages/cli/src/tui/console/HelpPane.tsx`: added `r rename` to shared help/footer hotkey metadata, which feeds `StatusFooter`.
- Focused tests cover action argv, pane helpers, lifecycle error interpretation, hotkey metadata, and layout regressions.

### Verification Evidence

- Focused regression tests passed: 5 files, 32 tests.
- Full CLI tests passed via `npx nx test cli`: 48 files, 671 tests.
- CLI lint passed via `npx nx lint cli`.
- CLI build passed via `npx nx build cli`.
- Base AI docs lint passed via `npx ai-devkit@latest lint`.
- Manual TTY smoke passed for console render, footer `r rename`, no-agent `r` guard, and clean `q` exit. Live selected-agent rename could not be manually exercised because no agents were running in the smoke environment.

## Phase 6 Implementation Check

Implementation aligns with the reviewed requirements and design.

File-by-file alignment:

- `actions/types.ts` and `actions/runAction.ts` implement the designed `rename` action and map it to `agent rename <currentName> <newName>` with argv-based spawning.
- `RenameAgentPane.tsx` implements the native Ink workspace with prefilled editable name, submit/cancel controls, submitting state, and clipped inline errors.
- `useRenameAgentPane.ts` implements retry/error lifecycle, success return to preview, and deliberately omits `refresh()`.
- `ConsoleApp.tsx` wires lowercase `r` for the selected agent, blocks shell-level handling while rename mode is active, renders rename as the replacement pane in narrow mode, and leaves existing open/send/start/kill paths intact.
- `HelpPane.tsx` updates the shared hotkey metadata consumed by the footer, so `StatusFooter` documents `r rename` without a separate footer-specific change.

Deviations and residual gaps:

- No design deviation requiring rework.
- Manual selected-agent rename smoke was not possible in this environment because no agents were running. Automated action/lifecycle tests and TypeScript build cover the behavior; live TTY selected-agent validation remains a useful final manual check when an agent is available.

## Phase 8 Code Review

Reviewed on 2026-06-02.

Findings:

- No blocking correctness, security, integration, or regression issues found.

Review notes:

- Design alignment: implementation matches the right-pane workspace architecture, selected-agent scope, CLI delegation, no-immediate-refresh decision, and footer/help update.
- Contract integrity: `ConsoleAction` and `RightPaneMode` are in-repo type unions; all call sites compile after the atomic update. No external API, config, schema, or registry format change was introduced.
- Security: user-provided names are passed as argv values to `spawn`; no shell interpolation was added.
- Dependency health: no new runtime dependencies were added. The existing `ink-text-input` dependency is reused.
- Rollback safety: changes are UI/action wiring only and can be reverted without migration or persistent data rollback.
- Test coverage: focused tests and full CLI suite pass. The only residual gap is live selected-agent TTY rename smoke in an environment with a running agent.

Final checklist:

- [x] Design match
- [x] No known logic gaps requiring rework
- [x] Security considerations addressed
- [x] Integration points verified
- [x] Tests cover changed action/helper/hotkey behavior
- [x] Docs updated

## Error Handling

- Subprocess non-zero output should be captured and shown inside the rename workspace.
- The TUI should not crash on not-found, conflict, invalid format, or unexpected subprocess failures.
- Duplicate submit should be prevented while `isSubmitting` is true.
- Cancel should clear local rename state and produce no side effects.

## Performance Considerations

- No new polling loop is introduced.
- No immediate refresh is called after success by user decision.
- Mode switching should be synchronous and lightweight.

## Security Notes

- User-supplied names are passed as process arguments, never shell-interpolated.
- No secrets or credential files are read.
- No new persistent storage is introduced beyond the existing registry mutation done by `agent rename`.
