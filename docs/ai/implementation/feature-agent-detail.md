---
phase: implementation
title: Agent Detail Command - Implementation Guide
description: Technical implementation notes for the agent detail command
---

# Implementation Guide

## Development Setup

- Worktree: `.worktrees/feature-agent-detail`
- Branch: `feature-agent-detail`
- Dependencies: already bootstrapped via `npm ci`

## Code Structure

**Files to modify:**
- `packages/agent-manager/src/adapters/AgentAdapter.ts` — add `sessionFilePath` to `AgentInfo`, add `ConversationMessage` type
- `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts` — populate `sessionFilePath`, add `getConversation()`
- `packages/agent-manager/src/adapters/CodexAdapter.ts` — populate `sessionFilePath`, add `getConversation()`
- `packages/agent-manager/src/index.ts` — export new types
- `packages/cli/src/commands/agent.ts` — add `detail` subcommand

## Implementation Notes

### ConversationMessage type
```typescript
export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
}
```

### Claude conversation parsing
- Read file once, split by newlines
- For each line: parse JSON, check `type` field
- Include `user`, `assistant`, `system` types
- Skip `progress`, `thinking`, `file-history-snapshot`, `last-prompt`
- Extract text content using existing `extractUserMessageText` logic for user messages
- For assistant messages, concatenate text blocks from `message.content` array

### Codex conversation parsing
- Skip `session_meta` first line
- Map event types to roles based on Codex format

### CLI output formatting
- Use `ui.text()` for section headers
- Use chalk for coloring roles
- Truncate very long messages with `--full` flag (future consideration)
