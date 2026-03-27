---
phase: testing
title: Display CWD in Agent List — Testing
description: Test strategy for CWD column feature
---

# Display CWD in Agent List — Testing

## Test Coverage Goals

- 100% coverage of `formatCwd()` helper
- Verify table output includes CWD column

## Unit Tests

### `formatCwd()` helper
- [ ] Returns `~`-prefixed path when projectPath starts with home directory
- [ ] Returns original path when projectPath doesn't start with home directory
- [ ] Returns empty string for empty/undefined input

### Table rendering
- [ ] Table headers include "CWD" column
- [ ] Table rows include formatted projectPath values
- [ ] CWD column appears in correct position (after Agent)

## Integration Tests

- [ ] `agent list` with agents shows CWD column in output
- [ ] `agent list --json` still returns full `projectPath` (no regression)
