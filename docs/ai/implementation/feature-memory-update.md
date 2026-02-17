---
phase: implementation
title: Memory Update CLI Command - Implementation
description: Implementation notes for memory update feature
---

# Implementation: Memory Update CLI Command

## Code Structure

Files to modify:
- `packages/memory/src/types/index.ts` — add new interfaces
- `packages/memory/src/services/validator.ts` — add `validateUpdateInput()`
- `packages/memory/src/handlers/update.ts` — new file, `updateKnowledge()`
- `packages/memory/src/api.ts` — add `memoryUpdateCommand()`
- `packages/memory/src/server.ts` — add MCP tool
- `packages/cli/src/commands/memory.ts` — add CLI subcommand

## Implementation Notes

### Handler Pattern
Follow `store.ts` exactly:
- Validate → fetch → normalize → check duplicates → execute SQL → return result
- Wrap DB operations in `db.transaction()`
- Catch and rethrow `DuplicateError`/`NotFoundError`, wrap unknown errors in `StorageError`

### Partial Update SQL
Build dynamic SET clause based on provided fields:
```sql
UPDATE knowledge SET
  title = ?, content = ?, tags = ?, scope = ?,
  normalized_title = ?, content_hash = ?, updated_at = ?
WHERE id = ?
```
Since we merge with existing values before executing, we always update all fields — simplifying the SQL.

### Duplicate Detection (Self-Exclusion)
```sql
SELECT id FROM knowledge WHERE normalized_title = ? AND scope = ? AND id != ?
SELECT id FROM knowledge WHERE content_hash = ? AND scope = ? AND id != ?
```

## Error Handling

| Error | Code | When |
|-------|------|------|
| `NotFoundError` | NOT_FOUND_ERROR | ID doesn't exist in database |
| `ValidationError` | VALIDATION_ERROR | Invalid input fields |
| `DuplicateError` | DUPLICATE_ERROR | Title/content conflicts with another item |
| `StorageError` | STORAGE_ERROR | Unexpected database error |
