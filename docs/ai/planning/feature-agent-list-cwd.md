---
phase: planning
title: Display CWD in Agent List — Planning
description: Task breakdown for adding CWD column to agent list
---

# Display CWD in Agent List — Planning

## Milestones

- [ ] Milestone 1: CWD column visible in `agent list` output

## Task Breakdown

### Phase 1: Implementation

- [ ] Task 1.1: Add `formatCwd()` helper function to `packages/cli/src/commands/agent.ts`
  - Import `os` module
  - Implement home directory `~` substitution
- [ ] Task 1.2: Add CWD column to table rendering
  - Add `formatCwd(agent.projectPath)` to rows array (index 1)
  - Add "CWD" to headers array (index 1)
  - Add `chalk.dim` column style (index 1)

### Phase 2: Testing

- [ ] Task 2.1: Update existing agent list tests to include CWD column
- [ ] Task 2.2: Add unit tests for `formatCwd()` helper

## Dependencies

- None — all data is already available in `AgentInfo.projectPath`

## Timeline & Estimates

- Total effort: Small (< 1 hour)
- Task 1.1 + 1.2: ~15 min implementation
- Task 2.1 + 2.2: ~15 min testing

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| Table width with long paths | `~` substitution reduces length; terminal handles wrapping |
