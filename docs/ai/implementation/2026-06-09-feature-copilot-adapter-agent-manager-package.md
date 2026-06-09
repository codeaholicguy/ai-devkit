---
phase: implementation
title: "Copilot Adapter in @ai-devkit/agent-manager - Implementation"
feature: copilot-adapter-agent-manager-package
description: Implementation notes for GitHub Copilot CLI adapter support
---

# Implementation: Copilot Adapter

## Development Setup

- Worktree: `.worktrees/feature-copilot-adapter-agent-manager-package`
- Branch: `feature-copilot-adapter-agent-manager-package`
- Dependency bootstrap: `npm ci`
  - Completed with packages installed and 0 vulnerabilities.
  - Husky attempted to write shared `.git/config` and was blocked by sandbox permissions; install still completed.
- Feature lint: `npx ai-devkit@latest lint --feature copilot-adapter-agent-manager-package` passed after Phase 1 docs.

## Code Structure

- `packages/agent-manager/src/adapters/CopilotAdapter.ts`
  - New adapter implementing `AgentAdapter`
  - Reads Copilot session-state directories, active lock files, event JSONL, and workspace fallback metadata
- `packages/agent-manager/src/__tests__/adapters/CopilotAdapter.test.ts`
  - New focused unit tests for active detection, parsing, listing, and conversations
- `packages/agent-manager/src/adapters/AgentAdapter.ts`
  - Adds `copilot` to `AgentType`
- `packages/agent-manager/src/adapters/index.ts` and `packages/agent-manager/src/index.ts`
  - Export `CopilotAdapter`
- `packages/agent-manager/src/utils/agents.ts`
  - Narrows `StartableAgentType` to explicitly startable agents so `copilot` does not require a start command
- `packages/cli/src/commands/agent.ts`
  - Registers `CopilotAdapter` and adds display label
- `packages/cli/src/services/channel/channel-runner.ts`
  - Registers `CopilotAdapter` for channel bridge agent resolution
- `packages/cli/src/util/sessions.ts`
  - Allows `--type copilot` for historical session filtering

## Implementation Notes

### Core Features
- Active detection is process-first:
  - `listAgentProcesses('copilot')`
  - `enrichProcesses(...)`
  - scan `~/.copilot/session-state/*/inuse.{pid}.lock`
  - validate lock PID against running Copilot process PIDs
  - suppress duplicate wrapper/child process-only fallbacks when processes share a terminal
- Historical sessions do not require locks:
  - `listSessions` walks every session-state child directory
  - Uses `events.jsonl` when present and `workspace.yaml` as fallback
- Conversation parsing supports observed Copilot event names:
  - `user.message` -> `user`
  - `assistant.message` -> `assistant`
  - `session.info`, `session.warning`, `tool.execution_*`, `function`, `abort`, `system.message` -> `system` only in verbose mode
- Status mapping:
  - `IDLE` if last activity exceeds the adapter threshold
  - `WAITING` for recent `assistant.message`, `assistant.turn_end`, `session.shutdown`, or `abort`
  - `RUNNING` otherwise

### Patterns & Best Practices
- Uses existing safe filesystem helpers from `utils/session.ts`
- Keeps process shell access in shared process utilities
- Matches executable basename (`copilot` / `copilot.exe`) rather than absolute path
- Keeps parsing tolerant: malformed JSONL lines are skipped

## Integration Points

- `AgentManager` consumes the adapter through the existing adapter contract
- CLI agent commands register Copilot in the same manager setup path as Claude/Codex/Gemini/OpenCode
- Channel bridge resolution registers Copilot so channel messages can target active Copilot sessions when terminal focus data exists

## Error Handling

- Missing `session-state` directory returns no sessions/agents without throwing
- Missing `events.jsonl` falls back to `workspace.yaml` where possible
- Invalid or unmatched lock PIDs are ignored
- Running processes without matched session metadata become process-only agents
- Copilot wrapper processes in the same terminal/cwd as a matched locked child process are not emitted as separate process-only agents

## Performance Considerations

- Active detection scans one shallow session-state level and lock file names
- Historical listing reads one event/workspace pair per session directory
- No SQLite reads are performed in v1

## Security Notes

- No network access or credential reads are added
- Adapter reads local Copilot metadata only
- Lock PID values are parsed from strict `inuse.{pid}.lock` filenames

## Verification Evidence

- `npx nx test agent-manager -- CopilotAdapter.test.ts`: passed, 20 tests
- `npx nx test agent-manager`: passed, 13 files / 383 tests
- `npx nx test cli -- sessions.test.ts`: passed, 20 tests
- `npm run typecheck -w @ai-devkit/agent-manager`: passed
- `npm run typecheck -w ai-devkit`: not available; CLI package has no `typecheck` script
- `npx nx build agent-manager`: passed
- `npx nx build cli`: passed, including dependent `agent-manager`, `channel-connector`, and `memory` builds
- `npx nx test cli -- agent.test.ts`: passed after dependent build, 49 tests
- `npx nx test cli -- channel.test.ts`: passed, 18 tests
- `npx nx test cli`: passed, 55 files / 698 tests
- `npx nx lint agent-manager`: passed after removing an unused import
- `npx nx lint cli`: passed with pre-existing warnings in unrelated files
- Final rerun `npx nx test agent-manager`: passed, 13 files / 383 tests
- Final rerun `npx nx build cli`: passed
- Live smoke via built `@ai-devkit/agent-manager` import: `CopilotAdapter.listSessions()` parsed 3 real historical sessions from `~/.copilot/session-state`; `detectAgents()` returned 0 active agents because no running Copilot process was detected at smoke time.
