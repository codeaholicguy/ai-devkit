---
phase: testing
title: Memory Update CLI Command - Testing
description: Testing strategy for memory update feature
---

# Testing: Memory Update CLI Command

## Test Coverage Goals

- Unit test coverage target: 100% of new/changed code
- Integration: CLI command end-to-end
- Focus areas: handler logic, validation, duplicate detection, error handling

## Unit Tests

### Handler: `updateKnowledge()` — `packages/memory/tests/integration/update.test.ts`
- [x] Successfully updates title only
- [x] Successfully updates content only
- [x] Successfully updates tags only
- [x] Successfully updates scope only
- [x] Successfully updates multiple fields at once
- [x] Throws `NotFoundError` for non-existent ID
- [x] Throws `ValidationError` when no update fields provided
- [x] Throws `ValidationError` for invalid title (too short/long)
- [x] Throws `ValidationError` for invalid content (too short/long)
- [x] Throws `ValidationError` for invalid tags
- [x] Throws `ValidationError` for invalid scope
- [x] Throws `DuplicateError` when updated title conflicts with another item
- [x] Throws `DuplicateError` when updated content conflicts with another item
- [x] Does NOT throw duplicate error when title/content matches self
- [x] Updates `updated_at` timestamp
- [x] Preserves `created_at` timestamp
- [x] Recalculates `normalized_title` when title changes
- [x] Recalculates `content_hash` when content changes

### Validator: `validateUpdateInput()` — `packages/memory/tests/unit/validator.test.ts`
- [x] Passes with valid ID and title
- [x] Passes with valid ID and content
- [x] Passes with valid ID and tags
- [x] Passes with valid ID and scope
- [x] Fails with missing ID
- [x] Fails with no update fields
- [x] Validates only provided fields (skips absent ones)
- [x] Fails with invalid title
- [x] Fails with invalid content
- [x] Fails with invalid tags
- [x] Fails with invalid scope

### CLI: `memory update` command — `packages/cli/src/__tests__/commands/memory.test.ts`
- [x] Outputs JSON success response
- [x] Outputs error message on failure and exits with code 1

## Test Reporting & Coverage

- **validator.ts**: 100% statements, 100% branches, 100% functions, 100% lines
- **Total tests**: 449 (99 memory + 350 CLI), all passing
- **New tests added**: 32 (19 integration + 11 unit + 2 CLI)
- Pre-existing coverage threshold failures in database/search modules are unrelated

## Test Data

- Temp-file SQLite database (existing test pattern)
- Test fixtures with known IDs seeded via `storeKnowledgeDirect()` helper
- Two distinct valid inputs for duplicate-detection cross-checking
