---
phase: requirements
title: Validation Migration to Zod
description: Replace hand-written validation logic with schema-based Zod validation
---

# Requirements: Validation Migration to Zod

## Problem Statement

The codebase currently uses hand-written validation functions in multiple places (including `packages/memory` and `packages/cli`). This leads to duplicated patterns, inconsistent error handling shape, and higher maintenance overhead when validation rules evolve.

- **Who is affected?** Developers maintaining CLI and memory package input handling.
- **Current workaround:** Add/modify custom validator functions per module.

## Goals & Objectives

**Primary goals:**
- Standardize runtime validation using Zod schemas instead of ad-hoc functions.
- Preserve current validation behavior and constraints (title/content lengths, tag/scope formats, query/limit boundaries).
- Keep error outputs actionable and semantically compatible with existing CLI/MCP consumers.

**Secondary goals:**
- Improve readability by co-locating schema and type intent.
- Reduce duplication by reusing shared schema fragments.

**Non-goals:**
- Changing business rules for what is considered valid input.
- Rewriting unrelated non-validation logic.
- Introducing a different validation library.

## User Stories & Use Cases

1. As a maintainer, I want validation rules defined in schemas so I can update constraints in one place.
2. As a maintainer, I want consistent validation errors so CLI and MCP behavior remains predictable.
3. As a contributor, I want tests around schema validation so refactors are safer.

**Key workflows:**
- `memory store` validates input via Zod schema before persistence.
- `memory update` validates partial updates via Zod schema before persistence.
- `memory search` validates query/limit/scope via Zod schema before query execution.
- CLI package validators validate registry/skill and related CLI input via Zod schema before command execution.

**Edge cases:**
- Optional fields in update payloads should validate only when provided.
- Multiple invalid fields should still produce clear aggregated error output.
- Existing generic content checks should remain enforced (or be explicitly documented if removed).

## Success Criteria

1. Validation logic for custom validator paths in `packages/memory` and `packages/cli` is schema-based (Zod), not manually constructed field validators.
2. Existing acceptance behavior remains stable for valid and invalid inputs.
3. Test suite covers schema success paths and failure paths for all migrated inputs.
4. No regression in CLI/MCP command contract for validation failures.
5. Validation message text may change, but failure semantics remain equivalent.

## Constraints & Assumptions

- **Technical constraints:**
  - Existing error class patterns (`ValidationError`) should remain the public error type.
  - Current TypeScript and package structure must be preserved.
- **Assumptions:**
  - User request "zoi" means **Zod**.
  - Migration scope includes both `packages/memory` and `packages/cli`.

## Questions & Open Items

- None at this stage.
