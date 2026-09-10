---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones

- [x] Milestone 1: Runtime config and registry schema foundation.
- [x] Milestone 2: Runtime dispatch for managed start/send/focus/stop.
- [x] Milestone 3: Herdr CLI/API adapter and focused validation.

## Task Breakdown

### Phase 1: Foundation

- [x] Task 1.1: Add global `agentRuntime.provider` config parsing with tmux defaults, unknown-provider validation, and project-config ignore behavior. Validation: focused config tests.
- [x] Task 1.2: Add `runtime` and `runtime_ref` columns to the `agents` registry migration path while keeping `tmux_session`. Validation: migration and registry tests.
- [x] Task 1.3: Extend `RegistryEntry` mapping/merge logic to round-trip runtime metadata and treat old records as tmux. Validation: AgentRegistry unit tests.
- [x] Task 1.4: Define runtime provider types, availability result types, runtime refs, and target operation inputs. Validation: typecheck and focused unit tests.

### Phase 2: Core Features

- [x] Task 2.1: Preserve current tmux behavior as the default service branch. Validation: existing agent start tests plus new runtime dispatch tests.
- [x] Task 2.2: Update `agent start` to resolve the global runtime once and call the selected runtime. Validation: CLI/service tests for tmux default and Herdr configured provider.
- [x] Task 2.3: Update send, send-and-wait, read output, focus/open, and kill/stop paths to use the target registry row's stored runtime. Validation: CLI/service tests for stored-runtime dispatch.
- [x] Task 2.4: Keep AI DevKit detail/list metadata AI DevKit-owned and add only minimal runtime metadata to registry entries. Validation: existing list/detail tests.

### Phase 3: Integration & Polish

- [x] Task 3.1: Implement Herdr availability using binary check plus backend/API snapshot, with `HERDR_ENV` and `HERDR_PANE_ID` as optional context. Validation: mocked Herdr client tests.
- [x] Task 3.2: Implement Herdr start/send/read-output/focus/stop command mappings with structured JSON parsing and no guessed IDs. Validation: mocked command tests.
- [x] Task 3.3: Add user-facing error messages for missing Herdr binary, unreachable backend, stale refs, malformed refs, and runtime mismatch cases. Validation: CLI tests.
- [x] Task 3.4: Update docs/user-visible command descriptions that currently hardcode tmux for runtime-generic behavior. Validation: docs lint.
- [x] Task 3.5: Run focused package tests and lint. Manual Herdr smoke testing remains deferred until a live Herdr backend is available. Validation: recorded task evidence.

## Dependencies

- Task 1.1 must land before command routing uses runtime config.
- Tasks 1.2 and 1.3 must land before Herdr runtime refs can be persisted.
- Task 2.1 should precede Herdr runtime implementation to prove the abstraction preserves tmux behavior.
- Herdr command mappings require exact Herdr CLI/API command and JSON response contracts.
- Send-and-wait behavior depends on whether Herdr can provide output boundaries or whether AI DevKit must keep using session transcript polling.

## Timeline & Estimates

- Foundation: medium, mostly schema/config/tests.
- Runtime dispatch: medium-high, touches existing command paths and tests.
- Herdr adapter: medium, but depends on command/API contract confirmation.
- Manual smoke testing: small if Herdr is installed and backend available; otherwise blocked/deferred with documented gap.

## Risks & Mitigation

- Risk: Registry identity currently keys on `(type, pid)`, while Herdr refs are pane/session based. Mitigation: confirm Herdr PID behavior early; if PID is optional, plan a focused identity change before Herdr start.
- Risk: Removing `tmux_session` now causes broad churn. Mitigation: keep it for MVP and migrate call sites gradually.
- Risk: Herdr CLI output format changes or is not JSON. Mitigation: require structured responses for MVP code and keep the client injected/testable.
- Risk: `agent send --wait` semantics diverge across runtime providers. Mitigation: preserve AI DevKit transcript-based waiting where possible and use Herdr output only as transport/result input.
- Risk: Global runtime config conflicts with old stored rows. Mitigation: operate existing agents by stored runtime and make mismatch messaging explicit.
- Risk: Herdr may be configured from outside Herdr. Mitigation: availability checks binary and backend reachability, not only `HERDR_ENV`.

## Resources Needed

- Herdr CLI/API command reference or source inspection.
- Existing AI DevKit CLI and agent-manager test suites.
- Temporary SQLite fixtures for migration tests.
- A real Herdr environment for final manual smoke validation.
