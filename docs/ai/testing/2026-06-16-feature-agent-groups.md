---
phase: testing
title: Agent Groups - Testing Strategy
description: Test coverage for local agent group management and group send fan-out
---

# Agent Groups - Testing Strategy

## Test Coverage Goals

- Unit test 100% of new group service behavior.
- Cover new CLI command branches in `packages/cli/src/__tests__/commands/agent.test.ts`.
- Preserve existing `agent send --id` and `agent send --wait` tests unchanged.
- Mock file storage, `AgentManager`, `TerminalFocusManager`, and `TtyWriter` consistently with existing command tests.

## Unit Tests

### `AgentGroupService`

- [x] Creates the group file parent directory when needed.
- [x] Treats a missing group file as an empty list.
- [x] Lists groups sorted or in persisted order, matching the implemented CLI contract.
- [x] Creates a group with valid name and members.
- [x] Rejects invalid group names.
- [x] Rejects empty member lists.
- [x] Rejects blank member identifiers.
- [x] Rejects duplicate member identifiers on create and update.
- [x] Rejects creating an existing group.
- [x] Updates a group by replacing all members.
- [x] Adds a new member to an existing group.
- [x] Keeps add-member idempotent or errors on duplicates, matching the final implementation decision.
- [x] Removes one member from an existing group.
- [x] Rejects removing the last member from a group.
- [x] Removes a group.
- [x] Throws a clear parse error for malformed JSON.

Storage test evidence:

- `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts`: exit 0, 18 tests passed.
- `npm --workspace packages/cli run lint`: exit 0, with 5 pre-existing warnings outside the new group service files.

### CLI `agent group`

- [x] `agent group create <name> --agent a --agent b` persists a group and prints success.
- [x] `agent group create` with no `--agent` exits non-zero before writing.
- [x] `agent group update` replaces members and prints success.
- [x] `agent group add` appends a member.
- [x] `agent group remove-agent` removes a member.
- [x] `agent group remove` deletes a group.
- [x] `agent group list` prints configured groups.
- [x] `agent group detail <name>` prints group members.
- [x] Not-found, conflict, invalid name, invalid member, and malformed file errors are user-readable.

Group management CLI evidence:

- `npm --workspace packages/cli test -- --run src/__tests__/commands/agent.test.ts`: exit 0, 57 tests passed.
- `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0, 75 tests passed.

### CLI `agent send --group`

- [x] Rejects calls that omit both `--id` and `--group`.
- [x] Rejects calls that provide both `--id` and `--group`.
- [x] Rejects `--group` with `--wait` before sending.
- [x] Rejects `--group` with `--timeout` before sending.
- [x] Rejects `--group` with `--json` before sending.
- [x] Resolves a group and sends the positional message to every distinct target.
- [x] Reads explicit `--stdin` once and sends the same prompt to every target.
- [x] Reads implicit piped stdin once and sends the same prompt to every target.
- [x] Fails before sending when the group does not exist.
- [x] Fails before sending when the group has no members.
- [x] Fails before sending when any member does not resolve.
- [x] Fails before sending when any member resolves ambiguously.
- [x] Deduplicates two group members that resolve to the same live agent.
- [x] Warns for non-waiting targets and still attempts delivery.
- [x] Continues delivery after one target terminal send fails.
- [x] Sets a non-zero exit code when any target delivery fails.
- [x] Prints a success/failure summary.

Group send evidence:

- `npm --workspace packages/cli test -- --run src/__tests__/commands/agent.test.ts`: exit 0, 64 tests passed.
- `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0, 82 tests passed.
- `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0, 68 tests passed after simplification.
- `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0, 86 tests passed after simplification.
- Phase 9 review fix: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0, 89 tests passed after adding invalid-name coverage for `get()`, `group detail`, and `send --group`.
- `npm --workspace packages/agent-manager run build`: exit 0, compiled 39 files.
- `npm --workspace packages/channel-connector run build`: exit 0, compiled 11 files.
- `npm --workspace packages/cli test`: exit 0, 67 test files passed, 800 tests passed.
- Phase 7 fresh regression: `npm --workspace packages/cli test`: exit 0, 68 test files passed, 804 tests passed.
- Phase 7 fresh build: `npm --workspace packages/cli run build`: exit 0, compiled 172 files with SWC before declaration/template output.
- Phase 7 fresh lint: `npm --workspace packages/cli run lint`: exit 0, with 5 pre-existing warnings outside the agent-groups changes.
- Phase 9 final regression: `npm --workspace packages/cli test`: exit 0, 68 test files passed, 807 tests passed.
- Phase 9 final build: `npm --workspace packages/cli run build`: exit 0, compiled 172 files with SWC before declaration/template output.
- Phase 9 final lint: `npm --workspace packages/cli run lint`: exit 0, with the same 5 pre-existing warnings outside the agent-groups changes.
- Refactor focused regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0, 113 tests passed after consolidating send orchestration in `agent.service.ts`.
- Refactor feature-scoped coverage: `npm --workspace packages/cli exec -- vitest run --coverage --coverage.include=src/services/agent/agent-group.service.ts --coverage.include=src/services/agent/agent.service.ts --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0; statements 94.75%, branches 88.23%, functions 97.01%, lines 95.07%.
- Refactor full CLI regression: `npm --workspace packages/cli test`: exit 0, 67 test files passed, 806 tests passed.
- Refactor build: `npm --workspace packages/cli run build`: exit 0, compiled 170 files with SWC before declaration/template output.
- Refactor lint: `npm --workspace packages/cli run lint`: exit 0, with the same 5 pre-existing warnings outside the agent-groups changes.
- Refactor feature docs lint: `npx ai-devkit@latest lint --feature agent-groups`: exit 0.
- Final review focused regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0, 114 tests passed after adding early invalid-timeout validation coverage.
- Final review full CLI regression: `npm --workspace packages/cli test`: exit 0, 67 test files passed, 807 tests passed.
- Final review build: `npm --workspace packages/cli run build`: exit 0, compiled 170 files with SWC before declaration/template output.
- Final review lint: `npm --workspace packages/cli run lint`: exit 0, with the same 5 pre-existing warnings outside the agent-groups changes.
- Final review feature docs lint: `npx ai-devkit@latest lint --feature agent-groups`: exit 0.
- Simplification focused regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0, 114 tests passed after extracting the command reporter adapter.
- Simplification final regression: `npm --workspace packages/cli test`: exit 0, 67 test files passed, 807 tests passed after stabilizing the `startAgent` polling unit test timeout.
- Simplification final build: `npm --workspace packages/cli run build`: exit 0, compiled 170 files with SWC before declaration/template output.
- Simplification final lint: `npm --workspace packages/cli run lint`: exit 0, with the same 5 pre-existing warnings outside the agent-groups changes.
- Simplification final feature docs lint: `npx ai-devkit@latest lint --feature agent-groups`: exit 0.
- Naming simplification focused regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0, 114 tests passed after renaming the public group abstraction to `AgentGroupService`.
- Naming simplification full regression: `npm --workspace packages/cli test`: exit 0, 67 test files passed, 807 tests passed.
- Naming simplification build: `npm --workspace packages/cli run build`: exit 0, compiled 170 files with SWC before declaration/template output.
- Naming simplification lint: `npm --workspace packages/cli run lint`: exit 0, with the same 5 pre-existing warnings outside the agent-groups changes.
- Naming simplification feature docs lint: `npx ai-devkit@latest lint --feature agent-groups`: exit 0.
- Command split focused regression: `npm --workspace packages/cli test -- --run src/__tests__/commands/agent.test.ts src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts`: exit 0, 114 tests passed after extracting `agent group` registration to `commands/agent/group.command.ts`.
- Command split full regression: `npm --workspace packages/cli test`: exit 0, 67 test files passed, 807 tests passed.
- Command split build: `npm --workspace packages/cli run build`: exit 0, compiled 171 files with SWC before declaration/template output.
- Command split lint: `npm --workspace packages/cli run lint`: exit 0, with the same 5 pre-existing warnings outside the agent-groups changes.
- Command split feature docs lint: `npx ai-devkit@latest lint --feature agent-groups`: exit 0.
- Second review polling test fix: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent.service.test.ts`: exit 0, 29 tests passed after widening the remaining timing-sensitive polling test timeout.
- Second review feature regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0, 114 tests passed.
- Second review full regression: `npm --workspace packages/cli test`: exit 0, 67 test files passed, 807 tests passed.
- API naming cleanup focused regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent.service.test.ts`: exit 0, 29 tests passed after removing the `waitForResponse` alias.
- API naming cleanup feature regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0, 114 tests passed.
- API naming cleanup full regression: `npm --workspace packages/cli test`: exit 0, 67 test files passed, 807 tests passed.
- API naming cleanup build: `npm --workspace packages/cli run build`: exit 0, compiled 171 files with SWC before declaration/template output.
- API naming cleanup lint: `npm --workspace packages/cli run lint`: exit 0, with the same 5 pre-existing warnings outside the agent-groups changes.
- Test cleanup command regression: `npm --workspace packages/cli test -- --run src/__tests__/commands/agent.test.ts`: exit 0, 66 tests passed after removing stale wait-response mock scaffolding.
- Test cleanup feature regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0, 114 tests passed.
- Test cleanup full regression: `npm --workspace packages/cli test`: exit 0, 67 test files passed, 807 tests passed.
- Test cleanup build: `npm --workspace packages/cli run build`: exit 0, compiled 171 files with SWC before declaration/template output.
- Test cleanup lint: `npm --workspace packages/cli run lint`: exit 0, with the same 5 pre-existing warnings outside the agent-groups changes.

## Integration Tests

- [x] Commander-driven CLI tests cover group create, list, detail, update, add, remove-agent, remove, and send.
- [x] Mocked live-agent tests verify group send uses the same `TerminalFocusManager.findTerminal()` and `TtyWriter.send()` path as single-target send.
- [x] Regression tests confirm representative existing `agent send --id` tests still pass.

## End-to-End Tests

- [ ] Manual smoke: start two tmux-managed agents, create a group with both names, run `agent send "say ready" --group <name>`, and confirm both terminals receive the prompt. Pending because no controlled live tmux-managed test agents were available during implementation.
- [ ] Manual smoke: delete the group and confirm `agent send --group <name>` reports not found. Pending with the live-agent smoke.

## Test Data

- Temporary directory for the group JSON file.
- Mock groups: `backend-team`, `reviewers`, and `docs-team`.
- Mock agents with names, slugs, statuses, PIDs, and terminal locations.
- Ambiguous resolution fixture with two live agents matching one member identifier.

## Test Reporting & Coverage

- Focused feature tests: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0, 114 tests passed.
- Simplification focused regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0, 114 tests passed.
- Naming simplification focused regression: `npm --workspace packages/cli test -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0, 114 tests passed.
- Command split focused regression: `npm --workspace packages/cli test -- --run src/__tests__/commands/agent.test.ts src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts`: exit 0, 114 tests passed.
- Full CLI regression: `npm --workspace packages/cli test`: exit 0, 67 test files passed, 807 tests passed after the second review polling-test fix.
- Feature-scoped coverage: `npm --workspace packages/cli exec -- vitest run --coverage --coverage.include=src/services/agent/agent-group.service.ts --coverage.include=src/services/agent/agent.service.ts --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts`: exit 0; statements 94.75%, branches 88.23%, functions 97.01%, lines 95.07%.
- Broad focused coverage note: `npm --workspace packages/cli run test:coverage -- --run src/__tests__/services/agent/agent-group.service.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts` ran the same 86 tests successfully but exited 1 because the package coverage threshold measures all `src/**/*.ts` while only the feature suites were selected.
- Feature lint: `npx ai-devkit@latest lint --feature agent-groups`: exit 0.

## Manual Testing

- Validate human-readable command output for group management.
- Validate group send output when all targets succeed.
- Validate group send output when one target fails delivery.
- Validate no prompt is sent when group resolution is ambiguous.

## Performance Testing

- No dedicated load testing required for v1.
- Unit tests should cover at least a group with 10 members to catch accidental quadratic or output formatting issues.

## Bug Tracking

- Bugs found during implementation should be added to the planning doc as follow-up tasks or blockers.
