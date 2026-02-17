---
phase: requirements
title: Memory Update CLI Command
description: Allow users to update existing memory content by ID via the CLI
---

# Requirements: Memory Update CLI Command

## Problem Statement

Users can store and search knowledge items via the CLI (`memory store`, `memory search`), but there is no way to update an existing entry. If a knowledge item becomes outdated or contains errors, the user cannot modify it — they would need to delete and re-create it (and deletion isn't supported either). This creates stale knowledge that can mislead AI assistants relying on the memory service.

- **Who is affected?** Developers and AI assistants using `npx ai-devkit memory` to manage knowledge.
- **Current workaround:** None — users cannot modify stored knowledge at all.

## Goals & Objectives

**Primary goals:**
- Allow users to update the title, content, tags, and/or scope of an existing memory item by its ID
- Expose the update operation via CLI (`npx ai-devkit memory update`)
- Expose the update operation via MCP tool (`memory.updateKnowledge`)

**Non-goals:**
- Batch update of multiple items
- Interactive/editor-based editing (e.g., opening `$EDITOR`)
- Version history or undo support
- Delete command (separate feature)

## User Stories & Use Cases

1. **As a developer**, I want to update the content of a memory item by ID so that I can fix outdated or incorrect knowledge.
2. **As a developer**, I want to update only specific fields (e.g., just tags) without re-supplying all other fields so that partial updates are convenient.
3. **As an AI assistant**, I want to call `memory.updateKnowledge` via MCP to correct knowledge items discovered to be inaccurate.

**Key workflows:**
- User searches for a memory item → finds the ID → runs `memory update --id <id> --content "new content"`
- User updates tags on an item → `memory update --id <id> --tags "new-tag1,new-tag2"`

**Edge cases:**
- Updating title to one that already exists in the same scope (duplicate title conflict)
- Updating content to content that already exists in the same scope (duplicate content conflict)
- Updating a non-existent ID
- Providing no fields to update

## Success Criteria

1. `npx ai-devkit memory update --id <uuid> [options]` successfully updates the specified fields
2. Only provided fields are updated; unspecified fields remain unchanged
3. Validation rules (title length, content length, tag format, scope format) are enforced on updated values
4. Duplicate detection (normalized title + scope, content hash + scope) is enforced, excluding the item being updated
5. `updated_at` timestamp is refreshed on update
6. FTS5 index is automatically synced (existing DB triggers handle this)
7. MCP tool `memory.updateKnowledge` works identically
8. Command returns JSON response with success status and updated item ID
9. Proper error messages for not-found, validation, and duplicate errors

## Constraints & Assumptions

- **Technical constraints:**
  - Must use the existing `better-sqlite3` database and schema (no migrations needed — UPDATE triggers already exist)
  - Must follow existing patterns in `store.ts` and `search.ts` handlers
  - Must close database connection after CLI command (same pattern as store/search)
  - Validation reuses existing validators where possible
- **Assumptions:**
  - Users know the ID of the item to update (obtained via `memory search --table`)
  - At least one field must be provided for update (title, content, tags, or scope)

## Questions & Open Items

- All requirements are clear based on existing codebase patterns. No open questions.
