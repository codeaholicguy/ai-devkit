---
phase: planning
title: "Agent List Type Column - Planning"
description: Task breakdown for adding agent type to list output
---

# Planning: Agent List Type Column

## Milestones

- [ ] Milestone 1: Type column displayed in agent list table

## Task Breakdown

### Phase 1: Implementation

- [x] Task 1.1: Add `formatType()` helper function in `packages/cli/src/commands/agent.ts`
- [x] Task 1.2: Update table headers to include "Type" as 2nd column
- [x] Task 1.3: Update row mapping to include formatted type as 2nd value
- [x] Task 1.4: Update columnStyles array to include Type column style

### Phase 2: Testing

- [x] Task 2.1: Update existing agent list tests to expect the Type column
- [x] Task 2.2: Add unit tests for `formatType()` covering all AgentType values

## Dependencies

- Task 1.2–1.4 depend on Task 1.1
- Task 2.1–2.2 can run after Phase 1 is complete

## Risks & Mitigation

- **Low risk**: Purely additive UI change. No data or adapter modifications.
- **Table width**: Adding a column could affect formatting on narrow terminals — mitigated by short labels.
