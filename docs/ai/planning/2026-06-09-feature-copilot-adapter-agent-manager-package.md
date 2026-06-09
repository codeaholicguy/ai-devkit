---
phase: planning
title: "Copilot Adapter in @ai-devkit/agent-manager - Planning"
feature: copilot-adapter-agent-manager-package
description: Task breakdown for GitHub Copilot CLI adapter support
---

# Project Planning: Copilot Adapter

## Milestones

- [x] Milestone 1: Adapter model and parser foundation
- [x] Milestone 2: Active detection and historical session support
- [x] Milestone 3: Exports, tests, and verification

## Task Breakdown

### Phase 1: Foundation
- [x] Task 1.1: Add `copilot` to `AgentType`
- [x] Task 1.2: Create `CopilotAdapter` skeleton implementing `AgentAdapter`
- [x] Task 1.3: Add private helpers for Copilot session-state path resolution, executable matching, timestamp parsing, and text truncation
- [x] Task 1.4: Add event JSONL parser for session metadata, summary, last activity, and conversation messages
- [x] Task 1.5: Add workspace YAML fallback parser for flat scalar metadata

### Phase 2: Core Features
- [x] Task 2.1: Implement active detection from `listAgentProcesses('copilot')`, `enrichProcesses`, and `inuse.{pid}.lock`
- [x] Task 2.2: Implement process-only fallback for running Copilot processes without matched session metadata
- [x] Task 2.3: Implement `listSessions` over `~/.copilot/session-state/*`
- [x] Task 2.4: Implement `getConversation` from `events.jsonl`
- [x] Task 2.5: Export `CopilotAdapter` from package entry points

### Phase 3: Integration & Polish
- [x] Task 3.1: Add focused `CopilotAdapter` unit tests
- [x] Task 3.2: Add or update package export/manager tests if needed
- [x] Task 3.3: Run package tests and feature lint
- [x] Task 3.4: Update implementation/testing docs with evidence

## Dependencies

- Parser helpers precede detection/list/conversation methods
- Active detection depends on process utility mocks and lock scanning behavior
- Exports should happen after adapter compiles
- Tests should be added alongside each implementation slice

## Timeline & Estimates

- Foundation: small
- Core adapter behavior: medium
- Tests and verification: medium
- Target: complete within the current feature branch/worktree

## Risks & Mitigation

- Risk: Copilot event payload shapes vary by version.
  - Mitigation: keep parsing tolerant and test multiple plausible message shapes.
- Risk: Stale lock files could create false active agents.
  - Mitigation: validate lock PID against running Copilot process list.
- Risk: Linux executable paths differ from macOS Homebrew.
  - Mitigation: match executable basename rather than absolute path.
- Risk: `workspace.yaml` parser misses complex YAML.
  - Mitigation: only rely on flat scalar fields observed in Copilot metadata; leave complex parsing out of v1.

## Resources Needed

- Existing `CodexAdapter`, `GeminiCliAdapter`, and `OpenCodeAdapter` patterns
- Observed local Copilot session-state files for shape validation
- Vitest and Nx package test runner

## Phase 5 Planning Reconciliation

All planned milestones and tasks are complete. One implementation-time scope clarification was added: active detection suppresses duplicate process-only entries for Copilot wrapper/child process pairs sharing the same terminal, based on the observed macOS process shape where the lock points at the real Caskroom executable PID. No blockers remain. Next phases are implementation alignment review, test coverage review, and final code review.
