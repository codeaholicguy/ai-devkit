---
phase: planning
title: Agent Groups - Implementation Plan
description: Task breakdown for local agent group management and group send fan-out
---

# Agent Groups - Implementation Plan

## Milestones

- [x] Milestone 1: Group storage foundation with validation, typed errors, and focused unit tests.
- [x] Milestone 2: `agent group` management commands for create, update, add, remove-agent, remove, list, and detail.
- [x] Milestone 3: `agent send --group` fan-out path with selector validation, pre-delivery resolution, deduplication, and partial failure reporting.
- [ ] Milestone 4: Regression coverage, docs reconciliation, and manual smoke checklist.

## Task Breakdown

### Phase 1: Storage Foundation

- [x] Task 1.1: Implement `AgentGroupService` in `packages/cli/src/services/agent/agent-group.service.ts`.
  - Outcome: local `~/.ai-devkit/agent-groups.json` storage supports list, get, create, update, add member, remove member, and remove.
  - Dependencies: requirements and design docs.
  - Validation evidence: new unit tests for missing file, parent directory creation, formatted writes, atomic temp-file rename, CRUD behavior, and malformed JSON.
  - Related tests: `AgentGroupService` scenarios for file creation, missing file, create, update, add, remove member, remove, and malformed JSON.

- [x] Task 1.2: Add group schema validation, normalization, and typed errors.
  - Outcome: invalid group names, empty member lists, blank members, duplicate members, unknown file versions, conflicts, and not-found operations produce explicit typed errors.
  - Dependencies: Task 1.1.
  - Validation evidence: unit tests assert each typed error and unchanged storage for invalid operations.
  - Related tests: invalid names, empty members, blank members, duplicate members, existing group conflict, missing group, removing the last member, malformed storage.

- [x] Task 1.3: Decide and implement duplicate add-member semantics.
  - Outcome: `agent group add <name> <identifier>` has one explicit behavior for an existing member, documented in implementation notes.
  - Dependencies: Task 1.2.
  - Validation evidence: unit test for duplicate add-member behavior.
  - Related tests: add-member duplicate scenario.

Storage foundation status: completed with `AgentGroupService` and `agent-group.service.test.ts`. Duplicate add-member semantics are idempotent after trimming.

### Phase 2: Group Management CLI

- [x] Task 2.1: Register `agent group` nested commands via `packages/cli/src/commands/agent/group.command.ts`.
  - Outcome: create, update, add, remove-agent, remove, list, and detail commands are available under `agent group`.
  - Dependencies: Task 1.1 and Task 1.2.
  - Validation evidence: commander-driven tests parse each command and call the store through test-controlled storage.
  - Related tests: CLI group create, update, add, remove-agent, remove, list, detail.

- [x] Task 2.2: Add command output and error handling for group management.
  - Outcome: mutations print concise success messages, list/detail print readable group/member output, and service typed errors become user-readable non-zero command results.
  - Dependencies: Task 2.1.
  - Validation evidence: CLI tests assert output for success paths and not-found, conflict, invalid name, invalid member, empty members, and malformed storage errors.
  - Related tests: CLI group user-readable errors and group output scenarios.

Group management CLI status: completed with `agent group create/update/add/remove-agent/remove/list/detail` command wiring and command tests.

### Phase 3: Group Send Fan-Out

- [x] Task 3.1: Change `agent send` target selector validation.
  - Outcome: `--id` becomes optional at Commander registration, and action-level validation requires exactly one of `--id` or `--group`.
  - Dependencies: existing `agent send` command behavior.
  - Validation evidence: existing `--id` tests still pass; new tests reject missing target and `--id` plus `--group`.
  - Related tests: omit both selectors, provide both selectors, existing single-target regression.

- [x] Task 3.2: Add pre-delivery group send option validation and prompt resolution.
  - Outcome: `--group` rejects `--wait`, `--timeout`, and `--json` before sending, then reads positional or stdin prompt exactly once for valid group sends.
  - Dependencies: Task 3.1 and existing `resolveSendMessage()`.
  - Validation evidence: CLI tests prove invalid option combinations do not call terminal send; stdin tests prove the same prompt is sent to every target.
  - Related tests: reject `--wait`, reject `--timeout`, reject `--json`, explicit stdin, implicit piped stdin.

- [x] Task 3.3: Implement group member resolution.
  - Outcome: group send loads the named group, lists live agents once, resolves each stored member against that snapshot, reports all missing and ambiguous members, and fails before delivery when the target set is not fully resolved.
  - Dependencies: Task 1.1, Task 1.2, Task 3.1.
  - Validation evidence: CLI tests verify missing group, empty group, missing member, ambiguous member, and no terminal delivery before resolution success.
  - Related tests: group not found, no members, unresolved member, ambiguous member.

- [x] Task 3.4: Implement distinct target fan-out delivery.
  - Outcome: resolved live agents are deduplicated, non-waiting targets warn, delivery runs sequentially through `TerminalFocusManager.findTerminal()` and `TtyWriter.send()`, and successful sends are reported per agent.
  - Dependencies: Task 3.3.
  - Validation evidence: CLI tests assert target deduplication, delivery order, non-waiting warnings, and use of existing terminal writer path.
  - Related tests: send positional message to every distinct target, dedupe same live agent, warn for non-waiting target, terminal path integration.

- [x] Task 3.5: Implement runtime failure handling and summary output.
  - Outcome: terminal discovery or send failure for one resolved target does not stop later targets; the command reports success/failure counts and exits non-zero if any target fails.
  - Dependencies: Task 3.4.
  - Validation evidence: CLI tests assert continued delivery after one failure, non-zero exit code, and summary output.
  - Related tests: continues after terminal send failure, sets non-zero exit code, prints summary.

Group send fan-out status: completed with selector validation, unsupported group option rejection, stdin reuse, pre-delivery resolution, deduplication, sequential terminal delivery, partial failure reporting, and focused command tests.

### Phase 4: Regression, Docs, and Smoke

- [x] Task 4.1: Run focused CLI and service tests.
  - Outcome: new and existing command coverage passes locally.
  - Dependencies: Task 1.1 through Task 3.5.
  - Validation evidence: `npm test -- --run packages/cli/src/__tests__/commands/agent.test.ts` plus any new focused store test file.
  - Related tests: all unit and commander-driven scenarios.

- [x] Task 4.2: Run feature lint and update implementation/testing docs.
  - Outcome: implementation notes describe files changed, behavior decisions, and verification commands; testing doc checkboxes reflect completed automated coverage and manual smoke status.
  - Dependencies: Task 4.1.
  - Validation evidence: `npx ai-devkit@latest lint --feature agent-groups`.
  - Related tests: docs lifecycle validation.

- [ ] Task 4.3: Perform manual smoke when live agents are available.
  - Outcome: two tmux-managed agents receive one group send, and deleted groups produce not-found output.
  - Dependencies: implementation complete and local live agents available.
  - Validation evidence: command transcript or implementation note. If live agents are unavailable, record the skipped manual smoke and reason.
  - Related tests: manual smoke scenarios.

Manual smoke status: pending. No controlled pair of live tmux-managed test agents was available during implementation, so automated coverage and build verification are complete while live-agent smoke remains a follow-up check.

Phase 6 reconciliation: implementation tasks 1.1 through 4.2 are complete and verified. Task 4.3 remains pending because it requires controlled live tmux-managed agents; it is not blocking automated implementation verification. No new implementation tasks were discovered during reconciliation.

Phase 8 testing review: automated unit, command, focused feature coverage, full CLI regression, build, lint, and feature-doc lint checks are complete. Task 4.3 remains pending for a controlled live-agent smoke only.

Phase 9 review: final review found one invalid-name boundary gap in `AgentGroupService.get()`. The gap is fixed with service and command regression tests. No blocking review findings remain after re-verification.

Refactor follow-up: group persistence now lives behind `AgentGroupService` in `agent-group.service.ts`, while `agent.service.ts` owns `sendToAgent()`, `waitForAgentResponse()`, and `sendToAgentGroup()`. This keeps `commands/agent.ts` focused on root command wiring, send parsing, prompt resolution, group lookup, and service invocation.

Command split follow-up: `agent group` management command registration now lives in `packages/cli/src/commands/agent/group.command.ts`, reducing the root `agent.ts` file and keeping group CRUD command wiring colocated.

## Dependencies

- Storage tasks must land before CLI management commands.
- CLI management commands should land before group send, because group send depends on persisted group state.
- `agent send` selector validation should be changed before group fan-out logic to keep invalid combinations from reaching delivery.
- Runtime delivery can reuse existing `TerminalFocusManager` and `TtyWriter`; no agent-manager package changes are planned.
- Manual smoke depends on available live agents and supported terminal setup.

## Timeline & Estimates

- Storage foundation: medium, mostly local file validation and tests.
- Group management CLI: medium, command wiring plus output/error tests.
- Group send fan-out: large, highest risk due to preserving existing `agent send --id` and wait behavior while adding a second selector.
- Regression/docs/manual smoke: small to medium, depending on live-agent availability.

## Risks & Mitigation

- **Risk:** Changing `--id` from required to optional could regress existing error behavior.
  - Mitigation: add explicit target-selector tests and run existing `agent send --id` tests.
- **Risk:** Group sends could partially deliver after a stale or ambiguous member if resolution is interleaved with delivery.
  - Mitigation: implement a strict pre-delivery resolution phase before any terminal lookup or send.
- **Risk:** Tests could mutate real `~/.ai-devkit/agent-groups.json`.
  - Mitigation: inject store file paths and use temporary test directories.
- **Risk:** Malformed storage handling could hide user data problems.
  - Mitigation: typed storage errors include the file path and do not rewrite malformed files.
- **Risk:** Group wait mode scope may creep into this feature.
  - Mitigation: reject `--wait --group` before sending and document group wait as a future enhancement.

## Resources Needed

- Existing CLI command test harness in `packages/cli/src/__tests__/commands/agent.test.ts`.
- Existing terminal delivery mocks for `TerminalFocusManager` and `TtyWriter`.
- Temporary filesystem fixtures for `AgentGroupService` tests.
- Optional live tmux-managed agents for final manual smoke.

## Next Actions

- If live smoke is required before merge, start two controlled tmux-managed test agents and run `agent send --group` against only those agents.
- Prepare the branch for commit/PR once the pending manual smoke decision is made.

## Test Coverage Traceability

- `AgentGroupService` tests are covered by Tasks 1.1, 1.2, and 1.3.
- CLI `agent group` tests are covered by Tasks 2.1 and 2.2.
- CLI `agent send --group` selector and option tests are covered by Tasks 3.1 and 3.2.
- Group member resolution, missing, ambiguous, and dedupe tests are covered by Tasks 3.3 and 3.4.
- Runtime failure and summary tests are covered by Task 3.5.
- Integration and regression tests are covered by Task 4.1.
- Manual smoke tests are covered by Task 4.3.
