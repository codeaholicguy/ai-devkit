---
phase: testing
title: Testing Strategy - Validation Migration to Zod
description: Test plan for schema-based validation migration
---

# Testing Strategy: Validation Migration to Zod

## Test Coverage Goals

- 100% coverage for new/changed validation code paths.
- Regression coverage for existing invalid-input scenarios.

## Unit Tests

### `packages/memory/src/services/validator.ts`
- [ ] Valid store payload passes
- [ ] Invalid title/content/tags/scope fail with expected semantics
- [ ] Update payload enforces id + at least one update field
- [ ] Generic content phrase checks remain enforced (if retained)

### `packages/memory/src/handlers/search.ts`
- [ ] Valid search payload passes
- [ ] Invalid query length / invalid limit fail

## Integration Tests

- [ ] `memory store` rejects invalid inputs with `ValidationError`
- [ ] `memory update` rejects invalid partial updates with `ValidationError`
- [ ] `memory search` rejects invalid query payloads with `ValidationError`

## End-to-End Tests

- [ ] CLI flow: invalid input returns structured error output
- [ ] CLI flow: valid input remains successful and unchanged

## Test Data

- Reuse current fixtures for title/content/tags/scope boundary values.

## Test Reporting & Coverage

- Run `npm run test --workspace=packages/memory`
- Run workspace regression tests via root `npm run test`
- Record any coverage gaps and rationale in this document

## Manual Testing

- Validate representative CLI commands for store/update/search error paths.

## Performance Testing

- Not expected to require dedicated load testing for this migration.

## Bug Tracking

- Track behavior mismatches (especially error text drift) as regressions.
