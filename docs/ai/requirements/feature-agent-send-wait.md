---
phase: requirements
title: Agent Send Wait
description: Add a --wait mode to agent send so scripts can receive the response from an interactive agent session
---

# Agent Send Wait

## Problem Statement

`npx ai-devkit agent send` can deliver input to a running agent terminal, but it exits immediately after sending. This is useful for simple confirmations, but it is not enough for users who want a scriptable `claude -p` style workflow backed by an existing interactive Claude Code subscription session.

Affected users are developers who already run Claude Code interactively and want to automate short prompts from shells, scripts, editor tasks, or CI-like local workflows without switching terminals manually.

The current workaround is to run `agent send`, then separately inspect the terminal or run `agent detail` to see what happened. That breaks scriptability because the caller cannot know when the response is ready or capture it from stdout.

## Goals & Objectives

Primary goals:

- Add `--wait` to `npx ai-devkit agent send <message> --id <agent>`.
- After sending, poll the target agent transcript and print new assistant output produced after the send.
- Exit after the target agent is ready for user input again.
- Avoid replaying historical conversation messages.
- Let users override the default wait cap with `--timeout <milliseconds>`.
- Exit non-zero with a clear timeout error when the agent does not finish before the configured timeout.
- Preserve current fire-and-forget behavior when `--wait` is not provided.

Secondary goals:

- Reuse existing agent transcript parsing via `AgentAdapter.getConversation()`.
- Reuse existing status detection via `AgentManager.listAgents()`.
- Keep the implementation agent-type aware through existing adapters, with Claude Code as the primary target.
- Structure the implementation so later backlog items can add stdin prompts and `agent ask`.

Non-goals:

- Do not add `agent ask`.
- Do not add `--stream`, queueing, or `agent ask` in this feature.
- Do not start or manage Claude Code sessions automatically.
- Do not use Claude Agent SDK / `claude -p`.
- Do not capture terminal screen output directly.
- Do not change subscription or billing behavior.

## User Stories & Use Cases

- As a developer, I want `agent send --wait` to print the assistant response so I can call it from a shell script.
- As a developer, I want `agent send --wait` to wait until the agent is ready again so I know the turn has completed.
- As a developer, I want historical transcript content excluded so the command output contains only the response to my new prompt.
- As a developer, I want the existing `agent send` behavior unchanged when I do not pass `--wait`.

Primary workflow:

1. User has a running Claude Code session.
2. User runs `npx ai-devkit agent send "summarize current git diff" --id ai-devkit --wait`.
3. CLI resolves the agent and terminal, seeds the current transcript position, sends the prompt, then polls for new transcript messages.
4. CLI prints new assistant messages generated after the send.
5. CLI exits when the agent status returns to waiting.

Timeout workflow:

1. User runs `npx ai-devkit agent send "summarize current git diff" --id ai-devkit --wait --timeout 30000`.
2. CLI uses 30,000 milliseconds as the maximum wait duration.
3. If the agent does not return to a completed status before 30,000 milliseconds, the command exits non-zero and reports `Timed out waiting for agent "<name>" after 30000ms.`.

Edge cases:

- Target agent has no `sessionFilePath`: send succeeds, but wait mode fails with a clear message because transcript polling is unavailable.
- Target agent cannot be resolved: existing not-found and ambiguous-match behavior remains.
- Target terminal cannot be found: existing delivery error behavior remains.
- Agent exits while waiting: command exits non-zero with a clear message.
- Transcript parsing throws temporarily: command keeps polling for a bounded default period or until agent state proves failure.
- Agent produces no assistant messages before becoming waiting: command exits successfully with no assistant output and a status note on stderr.
- Agent is not waiting before send: existing warning remains; wait mode still works by seeding transcript before send.
- Timeout duration is malformed or non-positive: command exits non-zero before sending with a clear validation error.
- Timeout is provided without `--wait`: command exits non-zero before sending because timeout only applies to wait mode.

## Success Criteria

- `agent send <message> --id <agent> --wait` sends the message and prints only new assistant output.
- `agent send <message> --id <agent>` without `--wait` behaves as it does today.
- Existing not-found, ambiguous target, unsupported terminal, and terminal-not-found errors still work.
- Historical transcript messages are not printed in wait mode.
- The command exits when the agent returns to `AgentStatus.WAITING`.
- The command also exits when Claude Code reports `AgentStatus.IDLE` after new assistant output has been printed for the current send.
- `agent send <message> --id <agent> --wait --timeout <milliseconds>` passes the configured millisecond timeout to the wait helper.
- Timeout errors include the configured millisecond timeout and exit non-zero.
- Unit tests cover transcript seeding, output filtering, missing transcript path, agent termination, configurable timeout, and unchanged non-wait behavior.

## Constraints & Assumptions

- This feature depends on agent adapters that expose `sessionFilePath` and implement `getConversation()`.
- Claude Code is the main target because the opportunity comes from interactive Claude Code subscription usage.
- Waiting is transcript-based, not terminal-screen-based.
- Agent status is detected by re-running `AgentManager.listAgents()` and resolving the same target.
- Polling should use conservative intervals similar to the existing channel connector polling loop.
- The default wait cap remains 10 minutes when `--timeout` is omitted.
- Timeout values are positive integers interpreted as milliseconds.

## Resolved Decisions

- **Default maximum wait:** Use a 10-minute safety cap unless the user passes `--timeout <milliseconds>`.
- **Output streams:** Write assistant response content to stdout. Write status, progress, warnings, and errors to stderr through existing UI/error helpers where practical.
- **Default message filtering:** Print assistant text content only. Do not include user messages, tool calls, tool results, or verbose transcript details by default.

## Questions & Open Items

- None blocking for this feature.
