---
phase: implementation
title: Validation Migration to Zod
description: Implementation notes for replacing custom validators with Zod
---

# Implementation Guide: Validation Migration to Zod

## Development Setup

- Install dependencies in workspace after planning/design approval.
- Validate that `packages/memory` builds and tests pass before and after migration.

## Code Structure

- Primary scope: `packages/memory/src/services/validator.ts` and `packages/memory/src/handlers/search.ts`.
- Prefer schema + wrapper functions to keep external call sites stable.

## Implementation Notes

### Core Features
- Implement shared Zod schema fragments for title/content/tags/scope/query/limit.
- Keep `ValidationError` as output error type.
- Preserve rule constants and validation boundaries.

### Patterns & Best Practices
- Use `safeParse` where multi-error formatting is needed.
- Avoid duplicating regex and min/max constants.

## Integration Points

- Memory handlers: store/update/search
- CLI and MCP paths relying on memory handlers

## Error Handling

- Convert Zod errors to existing `ValidationError` message and `errors[]` metadata.

## Performance Considerations

- Keep validation synchronous and lightweight.

## Security Notes

- All external inputs must pass schema validation prior to DB access.
