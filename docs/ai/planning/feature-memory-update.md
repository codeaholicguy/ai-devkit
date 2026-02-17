---
phase: planning
title: Memory Update CLI Command - Planning
description: Task breakdown for implementing memory update by ID
---

# Planning: Memory Update CLI Command

## Milestones

- [x] Milestone 1: Core handler and types
- [x] Milestone 2: CLI and API integration
- [x] Milestone 3: MCP tool integration

## Task Breakdown

### Phase 1: Foundation — Types & Validation

- [x] Task 1.1: Add `UpdateKnowledgeInput` and `UpdateKnowledgeResult` types to `packages/memory/src/types/index.ts`
- [x] Task 1.2: Add `validateUpdateInput()` to `packages/memory/src/services/validator.ts` — validate ID required, at least one update field provided, reuse existing field validators for provided fields only

### Phase 2: Core Handler

- [x] Task 2.1: Create `packages/memory/src/handlers/update.ts` — implement `updateKnowledge()` function:
  - Validate input
  - Fetch existing item by ID (throw `NotFoundError` if missing)
  - Merge provided fields with existing values
  - Normalize title/tags/scope for merged values
  - Check duplicate title (excluding self by ID)
  - Check duplicate content hash (excluding self by ID)
  - Execute UPDATE SQL in transaction
  - Return success result

### Phase 3: API & CLI Integration

- [x] Task 3.1: Add `MemoryUpdateOptions` interface and `memoryUpdateCommand()` function to `packages/memory/src/api.ts`
- [x] Task 3.2: Export `updateKnowledge` and new types from `packages/memory/src/api.ts` and `packages/memory/src/index.ts`
- [x] Task 3.3: Add `memory update` subcommand to `packages/cli/src/commands/memory.ts`

### Phase 4: MCP Tool Integration

- [x] Task 4.1: Add `UPDATE_TOOL` definition and handler to `packages/memory/src/server.ts`

## Dependencies

- Task 1.1 → Task 1.2 → Task 2.1 (types before validation before handler)
- Task 2.1 → Task 3.1 → Task 3.2 → Task 3.3 (handler before API before CLI)
- Task 2.1 → Task 4.1 (handler before MCP)
- Tasks 3.3 and 4.1 are independent of each other

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| FTS5 trigger not firing on UPDATE | Search results stale | DB triggers already handle this — verify with test |
| Duplicate detection missing self-exclusion | Update fails on own data | SQL WHERE clause: `AND id != ?` |

## Resources Needed

- Existing codebase patterns in `store.ts`, `search.ts`
- `better-sqlite3` docs for UPDATE syntax (standard SQL)
- Existing test infrastructure for testing
