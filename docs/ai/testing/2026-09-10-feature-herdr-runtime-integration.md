---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals

- Unit coverage for all new config resolution, registry migration/defaulting, runtime dispatch, and Herdr CLI parsing/error branches.
- Integration coverage for CLI `agent start`, `agent send`, and registry persistence behavior using mocked runtime dependencies.
- Regression coverage proving default tmux behavior is unchanged when runtime config is absent.
- Manual smoke coverage against a real Herdr install/backend once exact Herdr CLI/API commands are confirmed.

## Unit Tests

### Global Config Resolver

- [x] Missing global config resolves to `tmux`.
- [x] Global config without `agentRuntime` resolves to `tmux`.
- [x] Global config with empty `agentRuntime` resolves to `tmux`.
- [x] Global config with `provider: "tmux"` resolves to tmux.
- [x] Global config with `provider: "herdr"` resolves to Herdr.
- [x] Unknown global provider errors with supported values.
- [x] Project config `agentRuntime` is ignored because runtime selection is global-only.

### Agent Registry

- [x] New rows can persist `runtime` and `runtime_ref`.
- [x] Old rows without runtime columns/defaults read as tmux.
- [x] Tmux rows use `runtimeRef.session` as the active runtime handle.
- [x] Legacy rows with only `tmux_session` synthesize tmux runtime refs when read.
- [x] Herdr rows round-trip opaque runtime refs without normalization.
- [x] Malformed `runtime_ref` is handled predictably.
- [x] Existing merge behavior preserves managed tmux session data.

### Runtime Dispatch

- [x] Runtime provider constants/types are sourced from `agent-manager`.
- [x] Herdr runtime factory and Herdr registry-entry predicate are exported by `agent-manager`.
- [x] `agent start` defaults to tmux runtime.
- [x] `agent start` uses Herdr runtime when configured.
- [x] `agent send` uses the target registry row runtime.
- [x] `agent send --wait` sends through the stored runtime and waits through the AI DevKit session transcript.
- [x] `agent send --wait` keeps polling briefly when waiting status appears before assistant transcript output.
- [x] Focus/open dispatches to Herdr for Herdr-backed records.
- [x] Kill/stop dispatches through stored runtime and preserves existing tmux behavior.
- [x] Managed start/stop/focus/send orchestration is covered in `agent-manager`.

### Herdr Runtime Client

- [x] Availability passes when binary exists and snapshot/API succeeds outside Herdr.
- [x] Availability includes `insideRuntime` when `HERDR_ENV=1`.
- [x] Availability includes `currentPaneId` when `HERDR_PANE_ID` is set.
- [x] Missing binary returns `binary-missing`.
- [x] Snapshot/API failure returns `backend-unreachable`.
- [x] Start parses session, pane ID, agent name, and optional PID from JSON response.
- [x] Start fails if required Herdr IDs are absent.
- [x] Send passes prompt without shell interpolation.
- [ ] Output read sanitizes terminal controls where needed.

## Integration Tests

- [x] CLI config fixture with no runtime keeps current `agent start` tmux dependency behavior.
- [x] Global CLI config fixture with Herdr routes managed start through Herdr runtime and stores `runtime_ref`.
- [x] Existing `agent list` and `agent detail` show AI DevKit metadata for Herdr records without requiring full Herdr session mirroring.
- [x] `agent send --wait` failure paths remain clear when a target has no session file or supported adapter.
- [x] SQLite migration applies to an old registry DB and preserves old tmux rows.

## End-to-End Tests

- [ ] Configure `{ "agentRuntime": { "provider": "herdr" } }` in `~/.ai-devkit/.ai-devkit.json`, start a Codex or Claude agent, send a prompt, wait for output, and focus/open the Herdr pane.
- [ ] Run the same command from outside Herdr and verify binary/API fallback detection works.
- [ ] Remove runtime config and verify tmux remains the active managed runtime.
- [ ] Attempt an unknown provider and verify the CLI exits before creating sessions.

## Test Data

- Temporary global `.ai-devkit.json` fixtures for config resolver tests.
- Temporary SQLite registry DBs at pre- and post-migration shapes.
- Fake Herdr executable/client responses with structured JSON.
- Existing fake agent fixtures for Codex/Claude/Pi where transcript parsing is involved.

## Test Reporting & Coverage

- Run focused package tests during implementation.
- Run affected CLI and agent-manager test suites before review.
- Record lifecycle evidence with task tracing after fresh successful commands.
- Document any manual Herdr smoke-test gap if Herdr command contracts are unavailable locally.
- Cleanup validation:
  - `packages/agent-manager`: `npx vitest run src/__tests__/utils/AgentRegistry.test.ts src/__tests__/runtime/AgentRuntime.test.ts src/__tests__/runtime/HerdrAgentRuntime.test.ts` passed, 3 files and 61 tests.
  - `packages/cli`: `npx vitest run src/__tests__/lib/Config.test.ts src/__tests__/lib/GlobalConfig.test.ts src/__tests__/util/config.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts` passed, 5 files and 208 tests.
  - `packages/agent-manager`: `npm run typecheck` passed.
  - `packages/cli`: `npx tsc --noEmit` passed.
  - `packages/agent-manager`: `npm run build` passed.
  - Repository: `npx ai-devkit@latest lint --feature herdr-runtime-integration` and `git diff --check` passed.
- Refactor validation:
  - `packages/agent-manager`: `npx vitest run src/__tests__/runtime/ManagedAgentRuntime.test.ts src/__tests__/runtime/AgentRuntime.test.ts src/__tests__/runtime/HerdrAgentRuntime.test.ts`.
  - `packages/agent-manager`: `npm run typecheck`, `npm run lint`, and `npm run build`.
  - `packages/cli`: `npx vitest run src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts src/__tests__/services/plugin/plugin-loader.service.test.ts`.
  - `packages/cli`: `npx tsc --noEmit` and `npm run lint`.
  - Repository: `npx ai-devkit@latest lint --feature herdr-runtime-integration` and `git diff --check`.

## Manual Testing

- Real Herdr runtime smoke test for start/send/wait/focus.
- Confirm Herdr focus/open behavior matches user expectations from both inside and outside Herdr.
- Review user-facing error messages for missing binary, unreachable backend, and stale pane refs.

## Performance Testing

- No formal load test is required for MVP.
- Compare basic CLI latency of Herdr start/send against tmux only to catch severe regressions.
- Defer event/latency optimization to the later socket API migration.

## Bug Tracking

- Track implementation blockers in the lifecycle planning doc and task events.
- Any discovered mismatch with Herdr CLI/API contracts should become an explicit planning task before code changes proceed.
