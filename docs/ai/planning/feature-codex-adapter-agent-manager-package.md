---
phase: planning
title: "Codex Adapter in @ai-devkit/agent-manager - Planning"
feature: codex-adapter-agent-manager-package
description: Task plan for adding Codex adapter support and integrating it into CLI agent commands
---

# Planning: Codex Adapter in @ai-devkit/agent-manager

## Milestones

- [ ] Milestone 1: Codex adapter design finalized and scaffolding created
- [ ] Milestone 2: Codex adapter implementation and package exports complete
- [ ] Milestone 3: CLI integration, tests, and verification complete

## Task Breakdown

### Phase 1: Foundation
- [ ] Task 1.1: Confirm Codex discovery inputs and mapping contract
  - Use `~/.codex/sessions/YYYY/MM/DD/*.jsonl` as the primary source
  - Parse line 1 `session_meta` for `id`, `cwd`, `timestamp`
  - Parse the last line for terminal event markers (`task_complete`, `turn_aborted`)
  - Define normalization rules for `id`, `name`, `cwd`, and `status`
- [ ] Task 1.2: Scaffold package adapter files
  - Add `CodexAdapter.ts` and test file skeleton
  - Update adapter/index exports

### Phase 2: Core Features
- [ ] Task 2.1: Implement Codex discovery and mapping logic
  - Parse metadata with robust validation/fallback behavior
  - Compute status using existing status model
- [ ] Task 2.2: Register Codex adapter in CLI command flow
  - Update all manager registration paths in `commands/agent.ts`
  - Preserve output structure and errors

### Phase 3: Integration & Polish
- [ ] Task 3.1: Add/extend tests
  - Unit tests for Codex adapter branches and failure handling
  - CLI command tests for registration/path coverage
- [ ] Task 3.2: Validate and document
  - Run lint/build/tests for affected projects
  - Record implementation + testing outcomes in docs/ai

## Dependencies

- Existing `@ai-devkit/agent-manager` adapter contract and utilities
- Existing CLI agent command integration points
- Availability of Codex metadata sources in local runtime

## Timeline & Estimates

- Task 1.1-1.2: 0.5 day
- Task 2.1-2.2: 1.0 day
- Task 3.1-3.2: 0.5 day
- Total estimate: 2.0 days

## Risks & Mitigation

- Risk: Codex metadata format may vary across versions.
  - Mitigation: defensive parsing + tests with partial/malformed fixtures.
- Risk: `agent open` behavior for Codex may need command-specific nuances.
  - Mitigation: validate open flow with representative commands and add focused tests.
- Risk: Adding adapter increases list latency.
  - Mitigation: keep async aggregation pattern and short-circuit invalid entries.

## Resources Needed

- Existing adapter examples (`ClaudeCodeAdapter`) as implementation template
- Maintainer validation for Codex session/source assumptions
- CI runtime for lint/build/test verification
