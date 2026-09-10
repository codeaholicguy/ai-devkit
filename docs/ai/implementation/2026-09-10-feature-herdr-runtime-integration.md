---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup

- Work in `.worktrees/feature-herdr-runtime-integration` on branch `feature-herdr-runtime-integration`.
- Use the existing npm workspace commands and focused Vitest targets for `packages/cli` and `packages/agent-manager`.
- Herdr command contracts must be confirmed before real integration code is finalized. Until then, inject a Herdr command runner so tests can use fake JSON responses.

## Code Structure

- `packages/cli/src/util/config.ts`: shared runtime provider validation.
- `packages/cli/src/lib/GlobalConfig.ts`: runtime config owner and global provider lookup.
- `packages/cli/src/lib/Config.ts`: global runtime provider delegation for caller compatibility.
- `packages/cli/src/services/agent/agent.service.ts`: managed agent orchestration that consumes runtime contracts from `agent-manager`.
- `packages/cli/src/commands/agent.ts`: command-level config reading, UI rendering, and runtime factory usage.
- `packages/agent-manager/src/utils/AgentRegistry.ts`: runtime metadata persistence.
- `packages/agent-manager/src/database/migrations/005_agent_runtime.sql`: additive registry migration.
- `packages/agent-manager/src/terminal/TmuxManager.ts`: low-level tmux operations.
- `packages/agent-manager/src/runtime/AgentRuntime.ts`: runtime interfaces, Herdr runtime factory, and Herdr registry-entry predicate.
- `packages/agent-manager/src/runtime/HerdrAgentRuntime.ts`: injected Herdr CLI client used by the CLI and reusable by later console/channel code.

## Implementation Notes

### Core Features

- Runtime config:
  - Parse only `agentRuntime.provider` from global `~/.ai-devkit/.ai-devkit.json`.
  - Ignore project-level `agentRuntime` in project install config.
  - Default to `tmux` for missing config, missing `agentRuntime`, or missing provider.
  - Reject unknown providers with valid values.
- Registry migration:
  - Add `runtime` and `runtime_ref`.
  - Keep the physical `tmux_session` column only for legacy row backfill and old-reader compatibility.
  - Parse `runtime_ref` as opaque JSON for known providers.
  - Preserve old rows as tmux.
- Runtime dispatch:
  - Start uses configured runtime.
  - Send/focus/kill use stored runtime on the target row.
  - Managed start/stop/focus/send orchestration lives in `agent-manager`; CLI passes the selected runtime provider and renders results.
  - Runtime contracts, factories, and runtime-entry predicates are exported from `agent-manager`; CLI does not define Herdr runtime interfaces or construct the Herdr adapter class directly.
  - Herdr references are captured from Herdr responses only.
- Herdr availability:
  - For `provider = herdr`, require Herdr binary availability and backend/API reachability.
  - Treat `HERDR_ENV` and `HERDR_PANE_ID` as optional context signals.
- Cleanup pass:
  - Removed an unused Herdr availability error reason.
  - Simplified Herdr runtime ref parsing to normalize each field once.
  - Trimmed duplicate runtime-provider tests from `ConfigManager`; `GlobalConfigManager` and config util tests own those behavior cases.
- Refactor pass:
  - Moved runtime start/stop/focus/send orchestration from CLI agent service into `agent-manager`.
  - Moved corresponding start/stop/focus/send tests into agent-manager runtime tests.
  - Kept CLI responsible for option parsing, config lookup, UI messages, and send/wait output formatting.

### Implemented Behavior

- Global config accepts only `tmux` and `herdr`; missing config, missing `agentRuntime`, and missing provider resolve to `tmux`.
- Project `.ai-devkit.json` does not configure runtime selection.
- Existing registry rows without runtime columns are migrated/read as tmux-backed records.
- Registry entries expose `runtime` and opaque JSON `runtimeRef`; tmux rows use `{ session: "<tmux-session>" }`.
- Old SQLite rows with only `tmux_session` synthesize `{ session: tmux_session }` when read.
- `agent start` reads global runtime config once for interactive mode and starts through tmux or Herdr accordingly.
- `agent send`, `agent send --wait`, `agent open`, and `agent kill` use stored Herdr refs when the target registry row is Herdr-backed.
- Runtime-aware start, stop, focus, and prompt delivery are centralized in `packages/agent-manager/src/runtime/ManagedAgentRuntime.ts`; `agent send --wait` reads AI DevKit session transcripts for both tmux and Herdr-backed agents.
- `agent send --wait` waits through a short transcript-flush grace period before reporting that an agent returned to waiting without assistant output.
- Durable mode is unchanged and remains separate from interactive runtime selection.

### Patterns & Best Practices

- Use `execFile` or injected argument-array command runners, not shell string execution.
- Validate Herdr JSON response shape before storing refs.
- Keep errors domain-specific enough for CLI messages and tests.
- Do not leak Herdr's full session model into AI DevKit detail/list data structures.
- Active call sites should consume `runtimeRef`; do not add new `tmuxSession` reads.

## Integration Points

- Herdr CLI/API:
  - availability: `herdr --version` or equivalent plus `herdr api snapshot` or equivalent.
  - start: command returns session, pane ID, agent name, and optional PID.
  - send: command targets a returned pane/session ref.
  - read/wait: command returns output/result where available; otherwise AI DevKit transcript polling remains the result source.
  - focus/open: command targets returned pane/session ref.
  - stop: command delegates lifecycle cleanup to Herdr where supported.
- Agent adapters:
  - Continue parsing agent-specific session files and summaries.
  - Do not become Herdr-aware unless Herdr needs adapter-specific launch metadata.

## Error Handling

- Unknown runtime provider: fail before side effects.
- Herdr binary missing: fail before start/send with clear installation/PATH guidance.
- Herdr backend unreachable: fail before start/send with backend/API guidance.
- Missing required Herdr IDs in response: fail and do not register the agent.
- PID unavailable: handle explicitly; do not guess.
- Stale runtime ref: fail target operation and suggest focusing/listing/restarting the agent.
- Malformed registry runtime ref: treat as target-specific data corruption, not a global list crash.

## Performance Considerations

- CLI process startup overhead is acceptable for MVP.
- Avoid repeated runtime config reads inside loops or per-target group sends.
- Keep the runtime boundary transport-agnostic so Herdr socket/event support can replace CLI calls later.

## Security Notes

- Do not pass prompts through shell interpolation.
- Do not store secrets in runtime refs or debug logs.
- Treat Herdr response JSON as untrusted.
- Preserve existing AI DevKit ownership over channel permissions, assignments, and validation evidence.

## Validation Evidence

- `packages/cli`: `npx vitest run src/__tests__/util/config.test.ts src/__tests__/lib/Config.test.ts src/__tests__/lib/GlobalConfig.test.ts src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts`
- `packages/cli`: `npx tsc --noEmit`
- `packages/agent-manager`: `npx vitest run src/__tests__/utils/AgentRegistry.test.ts src/__tests__/runtime/AgentRuntime.test.ts src/__tests__/runtime/HerdrAgentRuntime.test.ts`
- `packages/agent-manager`: `npm run typecheck`
- `packages/agent-manager`: `npm run build`
- repository: `npx ai-devkit@latest lint --feature herdr-runtime-integration`
- repository: `git diff --check`
- Refactor validation:
  - `packages/agent-manager`: `npx vitest run src/__tests__/runtime/ManagedAgentRuntime.test.ts src/__tests__/runtime/AgentRuntime.test.ts src/__tests__/runtime/HerdrAgentRuntime.test.ts`
  - `packages/agent-manager`: `npm run typecheck`
  - `packages/agent-manager`: `npm run lint`
  - `packages/agent-manager`: `npm run build`
  - `packages/cli`: `npx vitest run src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts src/__tests__/services/plugin/plugin-loader.service.test.ts`
  - `packages/cli`: `npx tsc --noEmit`
  - `packages/cli`: `npm run lint`
  - repository: `npx ai-devkit@latest lint --feature herdr-runtime-integration`
  - repository: `git diff --check`
