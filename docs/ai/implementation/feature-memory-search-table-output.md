---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup
**How do we get started?**

- Run from workspace root or `packages/cli/`.
- Install dependencies: `npm install`.
- Run focused CLI tests from package: `cd packages/cli && npm test -- memory.test.ts`.

## Code Structure
**How is the code organized?**

- `packages/cli/src/commands/memory.ts`
  - Adds `--table` flag for `memory search`.
  - Branches output mode: JSON default vs table view.
- `packages/cli/src/__tests__/commands/memory.test.ts`
  - Validates default JSON behavior, table formatting, and no-result warning path.

## Implementation Notes
**Key technical details to remember:**

### Core Features
- Feature 1: `memory search --table` prints table with headers `id`, `title`, `scope`.
- Feature 2: Default behavior remains unchanged (`console.log(JSON.stringify(...))`).
- Feature 3: Long titles are truncated with ellipsis for terminal readability.
- Feature 4: No results in table mode show warning and return successfully.

### Patterns & Best Practices
- Keep output-formatting concerns in CLI layer; memory package API remains unchanged.
- Reuse shared `ui.table`/`ui.warning` helpers for consistency with other commands.

## Integration Points
**How do pieces connect?**

- CLI command parses flags and calls `memorySearchCommand`.
- Result payload is mapped to display rows without modifying storage/search internals.

## Error Handling
**How do we handle failures?**

- Existing try/catch behavior is preserved.
- Errors are routed through `ui.error(...)` and exit code `1`.

## Performance Considerations
**How do we keep it fast?**

- No additional search calls introduced.
- Formatting is linear over returned rows (`O(limit)`), where `limit <= 20`.

## Security Notes
**What security measures are in place?**

- No new security surface; change is presentation-only.

## Phase 6 Check Implementation
**How does implementation align with requirements and design?**

- Alignment status: **Mostly aligned** with approved requirements and design.
- Verified:
  - `memory search --table` is implemented with columns `id`, `title`, `scope`.
  - Default output without `--table` remains JSON.
  - Empty table-mode result path shows warning and exits successfully.
  - Title truncation for table readability is implemented.
  - Tests cover JSON mode, table mode, and no-result behavior.
- Minor deviation (low severity):
  - New reusable `truncate(...)` utility was also applied to `skill find` description rendering.
  - Impact: positive consistency improvement; does not alter feature intent or memory API behavior.
