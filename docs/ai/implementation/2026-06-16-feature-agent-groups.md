---
phase: implementation
title: Agent Groups - Implementation Notes
description: Implementation progress, decisions, verification, and edge cases for agent groups
---

# Agent Groups - Implementation Notes

## Development Setup

- Active worktree: `.worktrees/feature-agent-groups`
- Branch: `feature-agent-groups`
- Feature lint command: `npx ai-devkit@latest lint --feature agent-groups`
- Focused CLI test command: `npm --workspace packages/cli test -- --run <path>`

## Code Structure

- `packages/cli/src/services/agent/agent-group.service.ts`: user-scoped local group storage, validation, and typed errors.
- `packages/cli/src/services/agent/agent.service.ts`: send target validation, single-agent delivery, wait-mode response handling, group member resolution, deduplication, sequential group delivery, and summary reporting.
- `packages/cli/src/__tests__/services/agent/agent-group.service.test.ts`: focused unit tests for the group service.
- `packages/cli/src/__tests__/services/agent/agent.service.test.ts`: focused unit tests for group send fan-out behavior.
- `packages/cli/src/commands/agent.ts`: root `agent` command wiring plus thin `agent send` routing into service functions.
- `packages/cli/src/commands/agent/group.command.ts`: `agent group` management command wiring.
- `packages/cli/src/__tests__/commands/agent.test.ts`: commander-driven tests for group management commands and send command routing.

## Implementation Notes

### Storage Foundation

- Implemented `AgentGroupService` with injectable file path for tests and default path `~/.ai-devkit/agent-groups.json`.
- File schema is `{ version: 1, groups: AgentGroup[] }`.
- Writes use parent-directory creation, a `.tmp` file, and `renameSync` to avoid truncated final files on successful writes.
- Missing storage file is treated as an empty group list.
- Malformed JSON and unsupported file versions throw `AgentGroupStorageError`; malformed storage is not rewritten.
- Group names use the existing agent naming convention: lowercase letters, digits, and hyphens, starting and ending with alphanumeric characters.
- Member identifiers are trimmed, must be non-blank, and must be unique per group.
- `get()` validates group names before lookup so read paths such as `agent group detail` and `agent send --group` report invalid names instead of treating malformed names as missing groups.
- `addMember()` is idempotent for an existing member after trimming.
- `removeMember()` rejects removing the final member so persisted groups remain non-empty.

### Group Management CLI

- Added nested `agent group` command under the existing `agent` command.
- `create` and `update` collect repeated `--agent <identifier>` options and pass them to `AgentGroupService`.
- `add` and `remove-agent` mutate one member.
- `remove` deletes a group.
- `list` renders configured groups with `ui.table()`.
- `detail` renders one group and its members, and throws `AgentGroupNotFoundError` when missing.
- Command tests mock `ConsoleApp` to keep the command suite focused on CLI parsing without loading channel TUI dependencies.

### Group Send Fan-Out

- Changed `agent send` target selection from Commander-level required `--id` to action-level validation that requires exactly one of `--id` or `--group`.
- `--group` rejects `--wait`, `--timeout`, and `--json` before delivery because group wait and group JSON result schemas are out of scope.
- Group sends reuse the existing prompt source resolver, so positional messages, explicit `--stdin`, and implicit piped stdin are read once before fan-out.
- Group sends load the group through `createDefaultAgentGroupService()`, list live agents once, and resolve every stored member identifier against the same live-agent snapshot before terminal delivery.
- Missing and ambiguous members are collected and reported together; no prompt is delivered when the group target set cannot be fully resolved.
- Resolved live agents are deduplicated by PID when available, falling back to name.
- Delivery is sequential through `TerminalFocusManager.findTerminal()` and `TtyWriter.send()`.
- Runtime terminal discovery or send failures are reported per agent; later targets still receive the prompt and the command sets `process.exitCode = 1` if any target fails.
- Refactor pass consolidated single-agent send, wait-mode response handling, and group fan-out in `agent.service.ts` through `sendToAgent()`, `waitForAgentResponse()`, and `sendToAgentGroup()`. `commands/agent.ts` now handles root command wiring, send parsing, prompt-source resolution, group lookup, and output adapter wiring.

## Integration Points

- `agent group create/update/add/remove-agent/remove/list/detail` now call `createDefaultAgentGroupService()`.
- Group management uses the same `withErrorHandler()` pattern as adjacent agent commands.
- `agent send --group` reuses the existing `AgentManager`, `TerminalFocusManager`, and `TtyWriter` integration points used by single-target send.
- No `agent-manager` package changes were made for storage or group management.

## Error Handling

- `AgentGroupNotFoundError`: missing group for update, add, remove-member, or remove.
- `AgentGroupConflictError`: create attempted for an existing group.
- `AgentGroupInvalidNameError`: invalid group name.
- `AgentGroupInvalidMemberError`: blank, duplicate, or absent member operation.
- `AgentGroupEmptyMembersError`: empty group creation/update or removing the last member.
- `AgentGroupStorageError`: malformed JSON, unsupported version, or malformed schema.

## Verification

- Red step: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts` failed with missing module before `AgentGroupService` existed.
- Green step: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts` exited 0 with 18 tests passed.
- Group command red step: `npm --workspace packages/cli test -- --run src/__tests__/commands/agent.test.ts` failed with the new `agent group` tests because no group commands were wired.
- Group command green step: `npm --workspace packages/cli test -- --run src/__tests__/commands/agent.test.ts` exited 0 with 57 tests passed.
- Group send red step: `npm --workspace packages/cli test -- --run src/__tests__/commands/agent.test.ts` failed with new group-send tests because `agent send` still treated `--group` as a single-target send.
- Group send green step: `npm --workspace packages/cli test -- --run src/__tests__/commands/agent.test.ts` exited 0 with 64 tests passed.
- Focused regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/commands/agent.test.ts` exited 0 with 82 tests passed.
- Simplification red step: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent.service.test.ts` failed before group fan-out was consolidated into `agent.service.ts`.
- Simplification green step: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts` exited 0 with 68 tests passed.
- Simplification focused regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts` exited 0 with 86 tests passed.
- Lint: `npm --workspace packages/cli run lint` exited 0. It reported 5 pre-existing warnings outside the new group service files.
- Build: `npm --workspace packages/cli run build` exited 0 and compiled 172 files with SWC before declaration/template output after simplification.
- Dependency package build for full CLI tests: `npm --workspace packages/agent-manager run build` exited 0 and compiled 39 files.
- Dependency package build for full CLI tests: `npm --workspace packages/channel-connector run build` exited 0 and compiled 11 files.
- Full CLI regression: `npm --workspace packages/cli test` exited 0 with 67 test files passed and 800 tests passed.
- Feature docs lint: `npx ai-devkit@latest lint --feature agent-groups` exited 0.
- Phase 7 implementation check: implementation aligns with requirements and design for local group storage, group management commands, group send fan-out, single-target send compatibility, unsupported group `--wait`/`--json` rejection, and pre-delivery resolution. No code deviations requiring design changes were found.
- Phase 7 fresh regression: `npm --workspace packages/cli test` exited 0 with 68 test files passed and 804 tests passed.
- Phase 7 fresh lint: `npm --workspace packages/cli run lint` exited 0 with the same 5 pre-existing warnings outside the agent-groups changes.
- Phase 7 fresh build: `npm --workspace packages/cli run build` exited 0 and compiled 172 files with SWC before declaration/template output.
- Phase 9 review finding: `AgentGroupService.get()` did not validate group names, so `agent group detail <invalid-name>` and `agent send --group <invalid-name>` reported not-found instead of invalid-name. Fixed by validating in `get()` and adding service plus command regression tests.
- Phase 9 focused regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts` exited 0 with 89 tests passed.
- Phase 9 feature-scoped coverage: `npm --workspace packages/cli exec -- vitest run --coverage --coverage.include=src/services/agent/agent-group.service.ts --coverage.include=src/services/agent/agent.service.ts --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts` exited 0 with statements 92.89%, branches 85.36%, functions 100%, and lines 93.14%.
- Phase 9 full CLI regression: `npm --workspace packages/cli test` exited 0 with 68 test files passed and 807 tests passed.
- Phase 9 final lint: `npm --workspace packages/cli run lint` exited 0 with the same 5 pre-existing warnings outside the agent-groups changes.
- Phase 9 final build: `npm --workspace packages/cli run build` exited 0 and compiled 172 files with SWC before declaration/template output.
- Phase 9 final feature docs lint: `npx ai-devkit@latest lint --feature agent-groups` exited 0.
- Refactor follow-up: renamed `agent-group.store.ts` to `agent-group.service.ts`, removed the standalone group-send service split, and consolidated send orchestration into `agent.service.ts` with `sendToAgent()`, `waitForAgentResponse()`, and `sendToAgentGroup()`.
- Refactor focused regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts` exited 0 with 113 tests passed.
- Refactor feature-scoped coverage: `npm --workspace packages/cli exec -- vitest run --coverage --coverage.include=src/services/agent/agent-group.service.ts --coverage.include=src/services/agent/agent.service.ts --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts` exited 0 with statements 94.75%, branches 88.23%, functions 97.01%, and lines 95.07%.
- Refactor full CLI regression: `npm --workspace packages/cli test` exited 0 with 67 test files passed and 806 tests passed.
- Refactor lint: `npm --workspace packages/cli run lint` exited 0 with the same 5 pre-existing warnings outside the agent-groups changes.
- Refactor build: `npm --workspace packages/cli run build` exited 0 and compiled 170 files with SWC before declaration/template output.
- Refactor feature docs lint: `npx ai-devkit@latest lint --feature agent-groups` exited 0.
- Final review finding: invalid single-target `--timeout` was parsed inside `sendToAgent()` after prompt resolution, so an invalid timeout could be reported after message-source errors. Fixed by validating timeout syntax in `assertSendTargetOptions()` before `resolveSendMessage()`.
- Final review focused regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts` exited 0 with 114 tests passed.
- Final review full CLI regression: `npm --workspace packages/cli test` exited 0 with 67 test files passed and 807 tests passed.
- Final review lint: `npm --workspace packages/cli run lint` exited 0 with the same 5 pre-existing warnings outside the agent-groups changes.
- Final review build: `npm --workspace packages/cli run build` exited 0 and compiled 170 files with SWC before declaration/template output.
- Final review feature docs lint: `npx ai-devkit@latest lint --feature agent-groups` exited 0.
- Simplification follow-up: extracted the inline single-agent send reporter adapter from `agent send` into `createCommandSendReporter()`, keeping command routing readable while preserving service/reporting behavior.
- Simplification focused regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts` exited 0 with 114 tests passed.
- Test stability follow-up: widened the polling timeout in the `startAgent` polling unit test to avoid full-suite scheduling jitter while preserving the same polling behavior assertion.
- Final simplification regression: `npm --workspace packages/cli test` exited 0 with 67 test files passed and 807 tests passed.
- Final simplification lint: `npm --workspace packages/cli run lint` exited 0 with the same 5 pre-existing warnings outside the agent-groups changes.
- Final simplification build: `npm --workspace packages/cli run build` exited 0 and compiled 170 files with SWC before declaration/template output.
- Final simplification feature docs lint: `npx ai-devkit@latest lint --feature agent-groups` exited 0.
- Naming simplification follow-up: renamed the public group persistence abstraction to `AgentGroupService` and replaced the static default accessor with `createDefaultAgentGroupService()` so command code uses service terminology.
- Naming simplification focused regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts` exited 0 with 114 tests passed.
- Naming simplification full regression: `npm --workspace packages/cli test` exited 0 with 67 test files passed and 807 tests passed.
- Naming simplification lint: `npm --workspace packages/cli run lint` exited 0 with the same 5 pre-existing warnings outside the agent-groups changes.
- Naming simplification build: `npm --workspace packages/cli run build` exited 0 and compiled 170 files with SWC before declaration/template output.
- Naming simplification feature docs lint: `npx ai-devkit@latest lint --feature agent-groups` exited 0.
- Command split follow-up: extracted `agent group` command registration from `packages/cli/src/commands/agent.ts` into `packages/cli/src/commands/agent/group.command.ts`, reducing the root command file to 739 lines while preserving the existing command behavior.
- Command split focused regression: `npm --workspace packages/cli test -- --run src/__tests__/commands/agent.test.ts src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts` exited 0 with 114 tests passed.
- Command split full regression: `npm --workspace packages/cli test` exited 0 with 67 test files passed and 807 tests passed.
- Command split lint: `npm --workspace packages/cli run lint` exited 0 with the same 5 pre-existing warnings outside the agent-groups changes.
- Command split build: `npm --workspace packages/cli run build` exited 0 and compiled 171 files with SWC before declaration/template output.
- Command split feature docs lint: `npx ai-devkit@latest lint --feature agent-groups` exited 0.
- Second review finding: the `keeps polling until findAgentPid returns a PID` test still used the original 50ms polling timeout and could repeat the earlier full-suite scheduling flake. Fixed by widening that test's timeout to 250ms while preserving the same polling assertion.
- Second review focused regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent.service.test.ts` exited 0 with 29 tests passed.
- Second review feature regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts` exited 0 with 114 tests passed.
- Second review full regression: `npm --workspace packages/cli test` exited 0 with 67 test files passed and 807 tests passed.
- API naming cleanup: removed the `waitForResponse` alias and kept the explicit `waitForAgentResponse()` export.
- API naming cleanup verification: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent.service.test.ts` exited 0 with 29 tests passed; focused feature tests, full CLI tests, build, lint, and feature docs lint also exited 0.

## Manual Testing

- Live-agent smoke is pending. I did not send prompts to arbitrary running agents; a controlled pair of tmux-managed test agents is needed for the final manual check.

## Security Notes

- The storage foundation does not invoke shell commands.
- User-provided group names and members are validated or normalized before persistence.
