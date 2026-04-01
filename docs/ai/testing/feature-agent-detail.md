---
phase: testing
title: Agent Detail Command - Testing Strategy
description: Test plan for the agent detail command
---

# Testing Strategy

## Test Coverage Goals

- 100% coverage for new conversation parsing methods
- Integration tests for CLI command output
- Edge case coverage for malformed JSONL

## Unit Tests

### ClaudeCodeAdapter.getConversation()
- [x] Parses valid JSONL with user and assistant text messages
- [x] Skips metadata entries (file-history-snapshot, last-prompt)
- [x] Skips progress and thinking entries
- [x] Includes system messages
- [x] Skips tool_use and tool_result in default mode
- [x] Includes tool_use and tool_result in verbose mode
- [x] Handles tool_result errors in verbose mode
- [x] Handles malformed JSON lines gracefully (skip and continue)
- [x] Returns empty array for missing file
- [x] Returns empty array for empty file
- [x] Filters noise messages (interrupted, Tool loaded., etc.)

### CodexAdapter.getConversation()
- [x] Parses valid Codex JSONL with user and agent messages
- [x] Skips session_meta entry
- [x] Maps task_complete to assistant role
- [x] Skips non-conversation types in default mode
- [x] Includes non-conversation types as system in verbose mode
- [x] Handles malformed lines gracefully
- [x] Returns empty array for missing file
- [x] Returns empty array for empty file
- [x] Skips entries with empty payload message

### AgentManager (existing tests updated)
- [x] MockAdapter implements getConversation() interface

## Test Files

- `packages/agent-manager/src/__tests__/adapters/ClaudeCodeAdapter.test.ts` — 11 new tests in `getConversation` describe block
- `packages/agent-manager/src/__tests__/adapters/CodexAdapter.test.ts` — 9 new tests in `getConversation` describe block
- `packages/agent-manager/src/__tests__/AgentManager.test.ts` — MockAdapter updated

## Test Results

- **178 tests passing** (20 new + 158 existing)
- **Coverage threshold met** (80% minimum)
- All tests use real temp files (no fs mocking) following existing patterns

## Test Data

- Temp JSONL files created in `beforeEach`, cleaned in `afterEach`
- Inline fixture objects per test for clarity
