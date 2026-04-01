---
phase: planning
title: Agent Detail Command - Planning
description: Task breakdown and implementation plan for the agent detail command
---

# Project Planning & Task Breakdown

## Milestones

- [x] Milestone 1: Core infrastructure (AgentInfo extension + conversation reader)
- [x] Milestone 2: CLI command implementation
- [x] Milestone 3: Tests and polish

## Task Breakdown

### Phase 1: Core Infrastructure

- [x] Task 1.1: Add `sessionFilePath` field to `AgentInfo` interface in `AgentAdapter.ts`
- [x] Task 1.2: Populate `sessionFilePath` in `ClaudeCodeAdapter.mapSessionToAgent()` and `CodexAdapter`
- [x] Task 1.3: Add `ConversationMessage` type and `getConversation(filePath: string): ConversationMessage[]` method to `ClaudeCodeAdapter`
- [x] Task 1.4: Add `getConversation(filePath: string): ConversationMessage[]` method to `CodexAdapter`
- [x] Task 1.5: Export new types and methods from `@ai-devkit/agent-manager` package index

### Phase 2: CLI Command

- [x] Task 2.1: Add `agent detail` subcommand in `agent.ts` with `--id`, `--json`, `--full`, `--tail`, `--verbose` options
- [x] Task 2.2: Implement agent resolution logic (reuse `resolveAgent` by name + handle ambiguity)
- [x] Task 2.3: Implement human-readable output formatting (metadata header + tail-limited conversation, text-only default)
- [x] Task 2.4: Implement `--verbose` mode (include tool call/result details)
- [x] Task 2.5: Implement JSON output mode

### Phase 3: Testing & Polish

- [x] Task 3.1: Unit tests for `ClaudeCodeAdapter.getConversation()` — 11 tests
- [x] Task 3.2: Unit tests for `CodexAdapter.getConversation()` — 9 tests
- [ ] Task 3.3: Integration test for `agent detail` CLI command (deferred — requires running agents)
- [ ] Task 3.4: Manual testing with real running agents (deferred — requires running agents)

## Dependencies

- Task 1.1 must complete before Task 1.2
- Task 1.3/1.4 can run in parallel
- Task 1.5 depends on 1.1–1.4
- Phase 2 depends on Phase 1 completion
- Phase 3 depends on Phase 2 completion

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large session files slow down detail display | Medium | Stream/parse line by line (already done in readSession) |
| Codex JSONL format has undocumented fields | Low | Graceful fallback for unknown entry types |
| Adding field to AgentInfo breaks existing consumers | Low | Field is optional (`sessionFilePath?: string`) |
