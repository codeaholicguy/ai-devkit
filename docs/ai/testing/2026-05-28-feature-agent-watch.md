---
phase: testing
title: Testing Strategy & Coverage
description: Test coverage plan, test file locations, and results
---

# Testing Strategy & Coverage

## Scope

React components and hooks cannot be tested without `@testing-library/react` or `ink-testing-library` (not available in this project). Coverage targets all pure TypeScript logic: layout calculation, equality checks, LRU cache, time formatting, and subprocess dispatch.

## Test Files

| File | Covers | Tests |
|------|--------|-------|
| `src/__tests__/tui/console/computeLayout.test.ts` | `computeLayout()` in `ConsoleApp.tsx` | 10 |
| `src/__tests__/tui/console/render/formatRelative.test.ts` | `render/formatRelative.ts` | 8 |
| `src/__tests__/tui/console/hooks/conversationCache.test.ts` | `cacheSet`, `conversationCache`, `messagesEqual` | 11 |
| `src/__tests__/tui/console/hooks/agentsEqual.test.ts` | `agentsEqual` in `useAgentList.ts` | 11 |
| `src/__tests__/tui/console/actions/runAction.test.ts` | `runAction.ts` | 7 |

**Total new tests: 47** | **All passing**

## What Each Suite Validates

### `computeLayout`
- Fixed 48-col list pane in wide mode
- Right column fills remaining width minus separator
- Narrow mode uses `cols − 2` for list pane
- `contentHeight` never drops below `MIN_CONTENT_HEIGHT` (12) even on tiny terminals
- `inputBoxHeight` scales with `inputLines`
- `rightColWidth` clamped to 20 minimum; `inputInnerWidth` clamped to 4 minimum

### `formatRelative`
- All time buckets: now (< 5s), seconds, minutes, hours, days
- Future timestamps clamped to "now"
- String and Date inputs both accepted
- `undefined` returns `"—"`

### LRU Cache
- Store and retrieve
- Re-insert moves key to most-recent position (LRU refresh)
- Oldest key evicted when size hits `CACHE_MAX` (50)
- Never exceeds `CACHE_MAX` under sustained inserts

### `messagesEqual`
- Empty arrays equal
- Length mismatch → false
- role / content / timestamp field comparison
- Undefined timestamps handled

### `agentsEqual`
- Empty arrays equal
- Field-level comparison: name, status, type, summary, sessionFilePath, lastActive
- String `lastActive` compared correctly against `Date` (via `Date.parse()`)
- Order-sensitive multi-agent comparison

### `runAction`
- Success: exitCode 0, no error
- Non-zero exit + stderr → error string captured
- Non-zero exit + empty stderr → error undefined
- Spawn error (`ENOENT`) → exitCode null + error message
- `open` action argv shape: `['agent', 'open', '<name>']`
- `send` action argv shape: `['agent', 'send', '<msg>', '--id', '<name>']`
- `stdio: ['ignore', 'pipe', 'pipe']` verified (TUI terminal not seized)

## Coverage Notes

**Not covered by automated tests** (require ink-testing-library or manual QA):
- React component rendering: `AgentListPane`, `PreviewPane`, `StatusFooter`, `ChatInput`, `HeaderBar`
- Hook behaviour: `useAgentList`, `useAgentConversation`, `useTerminalSize`
- Keyboard navigation: j/k, o, i, q in `ConsoleAppShell`
- Narrow/wide layout transition on terminal resize

**Recommended manual QA scenarios:**
1. Rapid j/k navigation — verify 150ms debounce prevents excessive `statSync` calls
2. Resize terminal from < 120 cols to ≥ 120 cols — preview pane appears
3. Delete an agent mid-session — list resets to first agent without crash
4. Send message to agent — transient "Message sent" appears for 4s
5. Open action with bad agent name — transient error shown

## Results

```
Test Files  41 passed (41)
     Tests  621 passed (621)   ← includes 47 new agent-console tests
  Duration  2.65s
```
