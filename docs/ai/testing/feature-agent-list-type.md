---
phase: testing
title: "Agent List Type Column - Testing"
description: Test strategy for the agent type display feature
---

# Testing: Agent List Type Column

## Test Coverage Goals

- 100% coverage of `formatType()` helper
- All existing agent list tests updated to validate the Type column

## Unit Tests

### `formatType()`
- [ ] Returns "Claude Code" for `claude` type
- [ ] Returns "Codex" for `codex` type
- [ ] Returns "Gemini CLI" for `gemini_cli` type
- [ ] Returns "Other" for `other` type

### Agent list table output
- [ ] Table headers include "Type" as 2nd column
- [ ] Each row includes the formatted type value
- [ ] Existing status, name, summary, and active columns still render correctly

## Test Data

- Use existing mock agent fixtures with explicit `type` values
