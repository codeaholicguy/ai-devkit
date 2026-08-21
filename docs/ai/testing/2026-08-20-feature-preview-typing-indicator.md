---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals

- 100% statements, branches, functions, and lines for new pure frame logic.
- Component coverage for animation lifecycle and terminal fallback.
- Integration coverage for status mapping, row budgeting, render isolation, and scroll/content stability.

## Unit Tests
**What individual components need testing?**

### Frame logic
- [x] Select braille frames by default and ASCII frames only for `TERM=dumb`.
- [x] Cycle every frame and wrap indexes deterministically.
- [x] Verify all fallback frames are one-cell ASCII.

### Preview activity leaf
- [x] Render frame zero immediately and advance one frame per 160 ms with fake timers.
- [x] Clear the interval on unmount.
- [x] Hide, reset, and stop ticking on active-to-inactive transition; restart deterministically on reactivation.
- [x] Clean up correctly when status rerenders interleave with timer lifecycle.

## Integration Tests
**How do we test component interactions?**

- [x] Show the bottom row only for the selected agent in `RUNNING`; hide for `WAITING`, `IDLE`, `UNKNOWN`, and no selection.
- [x] Reserve one conversation line while active and reclaim it while inactive.
- [x] Keep the indicator below the newest visible content.
- [x] Advance frames without rerendering the preview parent or reparsing Markdown.
- [x] Preserve visible content and avoid scroll-clamp callbacks across frame ticks.

## End-to-End Tests
**What user flows need validation?**

- [x] Full console/workspace suite remains green.
- [x] Build, lint, and type declarations succeed.

## Test Data
**What data do we use for testing?**

- Existing `AgentInfo` and conversation fixtures, Ink `PassThrough` stdout, `render`/`renderToString`, `waitUntilRenderFlush`, and Vitest fake timers.
- No database or seed data.

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- Focused coverage: `npm exec vitest -- run packages/cli/src/__tests__/tui/console/PreviewActivityIndicator.test.tsx --coverage` with inclusion scoped to frame logic.
- Focused result: 5 tests passed; the new activity module reached 100% statements (20/20), branches (7/7), functions (6/6), and lines (17/17).
- Workspace result: 6 projects passed, 139 tests files and 1,937 tests total across project outputs (`npm test`, exit 0).
- Lint result: all 6 projects passed with 6 pre-existing unused-catch warnings and no errors (`npm run lint`, exit 0).
- Typecheck result: all configured Nx typecheck targets passed; the CLI additionally passed `npx tsc --noEmit -p packages/cli/tsconfig.json`.
- Build result: all 6 projects passed after a clean `npm ci`.
- Lifecycle feature lint passed for all five feature documents and the worktree.

## Manual Testing
**What requires human validation?**

- Inspect stripped Ink output for fixed-width glyph plus lowercase copy and correct bottom-row placement.
- Browser/device compatibility is not applicable to this terminal UI.

## Performance Testing
**How do we validate performance?**

- Render-count and Markdown-layout spies are the performance regression benchmark; frame ticks must leave both parent and Markdown counts unchanged.

## Bug Tracking
**How do we manage issues?**

- Any failing acceptance scenario returns to TDD before full gates; blocking review findings return to implementation/testing.
