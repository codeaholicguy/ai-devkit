---
phase: implementation
title: Agent Send Wait Implementation
description: Technical implementation notes for adding --wait to agent send
---

# Agent Send Wait Implementation

## Development Setup

- Worktree: `.worktrees/feature-agent-send-wait`
- Branch: `feature-agent-send-wait`
- Required Node: use Node 20-25. Local bootstrap succeeded with `/opt/homebrew/Cellar/node/24.3.0/bin` first in `PATH`.
- Build command used during setup: `PATH=/opt/homebrew/Cellar/node/24.3.0/bin:$PATH npm run build`
- Lint command used during setup: `PATH=/opt/homebrew/Cellar/node/24.3.0/bin:$PATH node packages/cli/dist/cli.js lint`

## Code Structure

Likely files:

- `packages/cli/src/commands/agent.ts`: add `--wait` option and connect command flow.
- `packages/cli/src/services/agent/agent.service.ts`: new agent service with the wait helper.
- `packages/cli/src/__tests__/commands/agent.test.ts`: command-level regression tests.
- `packages/cli/src/__tests__/services/agent/agent.service.test.ts`: helper-level tests for the agent service.

## Implementation Notes

### Core Features

- Seed transcript length before sending:
  ```typescript
  const initialMessageCount = adapter.getConversation(agent.sessionFilePath, { verbose: false }).length;
  await TtyWriter.send(location, message);
  ```
- Poll conversation and emit `conversation.slice(lastSeenCount)` entries where `role !== 'user'` and `content` is non-empty.
- Poll agent status by listing agents again and resolving the original `--id`.
- Stop when the resolved target status is `AgentStatus.WAITING`.
- Also stop on `AgentStatus.IDLE` after new assistant output has been observed for the current send.
- If a transcript read fails during a poll, do not complete even if status is already `WAITING`; retry until a read succeeds, the agent disappears, or the safety cap is reached.
- Parse `--timeout <milliseconds>` in the command layer as a positive integer.
- Pass parsed timeout milliseconds to `waitForAgentResponse()` and keep an `ms` label for user-facing timeout errors.
- Cap each wait-loop sleep to the remaining timeout so short timeouts do not oversleep the configured cap.
- Return non-zero for missing transcript path, terminated target, delivery failure, invalid timeout usage, and defensive timeout.

### Patterns & Best Practices

- Keep terminal delivery in `TtyWriter`; do not add new terminal-specific send logic.
- Keep transcript parsing inside adapters.
- Keep stdout focused on assistant content so scripts can consume it.
- Keep the 10-minute wait cap as the default when `--timeout` is omitted.

## Integration Points

- `AgentManager.listAgents()` for target detection and status refresh.
- `AgentManager.resolveAgent()` for target consistency.
- `AgentAdapter.getConversation()` for transcript polling.
- `TerminalFocusManager.findTerminal()` and `TtyWriter.send()` for existing delivery flow.

## Error Handling

- Missing target: existing command behavior.
- Ambiguous target: existing command behavior.
- Unsupported terminal or terminal not found: existing command behavior.
- Missing `sessionFilePath` in wait mode: print clear error and exit non-zero.
- Invalid `--timeout` milliseconds: print clear validation error and exit non-zero before sending.
- `--timeout` without `--wait`: print clear validation error and exit non-zero before sending.
- Transcript read error: continue polling for transient reads; fail after defensive cap or termination.
- Target disappears: fail non-zero with a clear termination message.
- Timeout reached: fail non-zero with `Timed out waiting for agent "<name>" after <milliseconds>ms.`.

## Performance Considerations

- Poll around every 1-2 seconds.
- Read only the normalized conversation array through the adapter.
- Track `lastSeenCount` to avoid repeated output work.
- Avoid long-running busy loops.

## Security Notes

- Continue using `TtyWriter.send()` and its `execFile`-based delivery.
- Do not introduce shell execution for prompts.
- Do not write prompt or response content to persistent storage for this feature.
