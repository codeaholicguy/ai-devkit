---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- Unit test coverage target: 100% of new/changed command logic in `memory.ts`.
- Integration scope: command parsing plus output-mode branching.
- Alignment: acceptance criteria for `--table`, default JSON, and no-result handling.

## Unit Tests
**What individual components need testing?**

### `packages/cli/src/commands/memory.ts`
- [x] Default `memory search` path prints JSON output.
- [x] `memory search --table` renders table with `id`, `title`, `scope`.
- [x] Long title is truncated in table output for readability.
- [x] `--table` with empty results prints warning and does not print table.
- [x] `memory store` success path prints JSON output.
- [x] `memory store` error path shows `ui.error` and exits with code `1`.
- [x] `memory search` error path shows `ui.error` and exits with code `1`.

### `packages/cli/src/util/text.ts`
- [x] Returns original text when already within max length.
- [x] Truncates with replacement text.
- [x] Handles non-positive max length.
- [x] Handles replacement text longer than max length.

## Integration Tests
**How do we test component interactions?**

- [x] Commander parsing -> memory search execution -> output mode selection.
- [x] `--limit` parsing is preserved in both JSON and table paths.

## End-to-End Tests
**What user flows need validation?**

- [ ] Manual smoke: run `npx ai-devkit@latest memory search --query "<q>"`.
- [ ] Manual smoke: run `npx ai-devkit@latest memory search --query "<q>" --table`.

## Test Data
**What data do we use for testing?**

- Mocked `memorySearchCommand` results; no DB dependency in CLI command tests.

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- Command run: `cd packages/cli && npm test -- memory.test.ts text.test.ts`.
- Result: passing (`10/10` tests).
- Coverage run:
  - `cd packages/cli && npx jest memory.test.ts text.test.ts --coverage --collectCoverageFrom='src/commands/memory.ts' --collectCoverageFrom='src/util/text.ts'`
  - `memory.ts`: 100% statements/lines/functions, 62.5% branches
  - `text.ts`: 100% statements/lines/functions/branches
- Coverage gap note:
  - Branch coverage remains below the global threshold due Commander option-chain instrumentation branches in `memory.ts`.
  - Functional branches in changed logic are covered by explicit success/error/no-result tests.

## Manual Testing
**What requires human validation?**

- Terminal readability with real data of varying title lengths.
- Behavior on different terminal widths.

## Performance Testing
**How do we validate performance?**

- Not required for this scoped presentation-only change.

## Bug Tracking
**How do we manage issues?**

- Track regressions under CLI/memory label and add command tests for any new output modes.
