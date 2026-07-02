---
phase: planning
title: Agent Console Detail Chat View - Project Planning
description: Initial task breakdown for focused and scrollable chat content in the interactive agent console
---

# Project Planning & Task Breakdown

## Milestones

- [x] Milestone 1: Requirements/design/testing reviewed and accepted
- [x] Milestone 2: Focus and scroll behavior implemented with tests
- [x] Milestone 3: Console regression tests complete; manual terminal smoke test deferred (PTY scan returns 0 agents; real-terminal verification recommended before broad rollout)

## Task Breakdown

### Phase 1: Focus Model

- [x] Task 1.1: Add `detail` to `ConsoleFocus` and route focus transitions in `ConsoleApp`.
  - Outcome: pressing `v` from list focus in wide mode enters detail focus when an agent is selected; `Esc` and left arrow return to list focus.
  - Dependencies: none.
  - Validation: focused key-routing helper tests cover `v`, `Esc`, left arrow, no-agent, and narrow-mode no-op behavior.
  - Related tests: ConsoleApp focus/key helper scenarios.
- [x] Task 1.2: Preserve existing list and input keyboard behavior.
  - Outcome: up/down and `j/k` still change selected agent in list focus; `i`/`m` still enter input focus; input cancel still returns to list focus.
  - Dependencies: Task 1.1.
  - Validation: regression tests for list navigation and input focus routing.
  - Related tests: ConsoleApp focus/key helper scenarios and existing console tests.
- [x] Task 1.3: Reset detail scroll offset when selected agent changes.
  - Outcome: switching agents returns the detail pane to latest content instead of carrying the prior agent's scroll position.
  - Dependencies: Task 1.1.
  - Validation: helper or component test verifies selected-agent change resets offset.
  - Related tests: ConsoleApp focus/key helper scenarios.

### Phase 2: Scrollable Preview Rendering

- [x] Task 2.1: Add pure viewport/scroll helper logic for preview chat content.
  - Outcome: helper converts `ConversationMessage[]`, message budget, and requested scroll offset into visible lines, clamped offset, max offset, and above/below affordance state.
  - Dependencies: none, but implement before wiring Ink rendering.
  - Validation: unit tests cover newest view, older view, negative offset, too-large offset, long conversations, and multi-line messages.
  - Related tests: PreviewPane viewport helper scenarios.
- [x] Task 2.2: Pass focus and scroll offset through `PreviewSection` to `PreviewPane`.
  - Outcome: focused preview uses existing `Panel` focus styling and receives the requested detail scroll offset.
  - Dependencies: Tasks 1.1 and 2.1.
  - Validation: component/helper test verifies focused panel prop and visible content changes with offset.
  - Related tests: integration scenarios for focused `PreviewSection`.
- [x] Task 2.3: Render scroll affordances when older/newer content exists outside the viewport.
  - Outcome: preview header shows subtle up/down indicators only when scrolling is possible.
  - Dependencies: Task 2.1.
  - Validation: unit tests verify `hasAbove`/`hasBelow` states and snapshot-light text assertions for header indicators.
  - Related tests: PreviewPane viewport helper scenarios.
- [x] Task 2.4: Clamp requested detail scroll offset when messages or terminal height change.
  - Outcome: preview reports clamped offsets upward so `ConsoleApp` state cannot remain outside the valid viewport range.
  - Dependencies: Tasks 2.1 and 2.2.
  - Validation: test covers shrinking content/height and verifies the callback receives the valid offset.
  - Related tests: integration scenarios for changing message count or `maxLines`.

### Phase 3: Tests & Polish

- [x] Task 3.1: Add unit tests for viewport clamping, visible-line selection, and affordance state.
  - Outcome: pure scroll math has deterministic coverage.
  - Dependencies: Task 2.1.
  - Validation: targeted `PreviewPane.test.ts` or new helper test passes.
- [x] Task 3.2: Add or update console focus/key routing tests.
  - Outcome: list/detail/input key behavior has regression coverage.
  - Dependencies: Tasks 1.1-1.3.
  - Validation: targeted console tests pass.
- [x] Task 3.3: Run feature lint and targeted console test suites.
  - Outcome: docs and changed console code pass validation.
  - Dependencies: implementation tasks complete.
  - Validation: `npx ai-devkit@latest lint --feature agent-console-detail-chat-view` and `npm test -- --run packages/cli/src/__tests__/tui/console`.
- [x] Task 3.4: Perform manual terminal smoke test with a running agent when available.
  - Outcome: real Ink focus styling and scroll behavior are visually confirmed.
  - Dependencies: implementation tasks complete and at least one running agent available.
  - Validation: manual notes in testing doc; if no running agent is available, record as deferred with reason.

## Dependencies

- Task 1.1 precedes all detail focus and scroll behavior.
- Task 2.1 should be implemented before changing Ink rendering so tests can cover the behavior directly.
- Task 2.4 depends on Task 2.1 because clamping should use the same helper that computes the viewport range.
- Task 3.2 depends on the chosen key-routing shape in `ConsoleApp`.
- No external services or API changes are required.

## Test Scenario Coverage

| Testing scenario | Covered by tasks |
| --- | --- |
| Newest content appears at offset 0 | 2.1, 3.1 |
| Older content appears at positive offset | 2.1, 3.1 |
| Offset clamping | 2.1, 2.4, 3.1 |
| Focused panel styling | 1.1, 2.2, 3.2 |
| Scroll keys do not move list selection in detail focus | 1.1, 1.2, 3.2 |
| Existing list/input behavior is unchanged | 1.2, 3.2 |
| No hidden focus trap in narrow mode | 1.1, 3.2, 3.4 |
| Scroll keypresses do not fetch conversation data | 2.2, 2.4, 3.3 |

## Timeline & Estimates

- Focus model: small.
- Scrollable preview rendering: medium, mainly due to line accounting in terminal UI.
- Tests and manual smoke: small to medium.

## Risks & Mitigation

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Focus trap in hidden narrow preview | High | Keep `v` inactive in narrow mode for this iteration. |
| Scroll keys break list navigation | High | Centralize key routing and add regression tests for both focus states. |
| Line accounting differs from Ink wrapping | Medium | Base helper on explicit rendered lines and keep content clipping conservative. |
| Conversation tail of 20 feels too short | Medium | Keep existing behavior initially; revisit tail size during implementation review if scrolling is not useful enough. |

## Resources Needed

- Existing console TUI components under `packages/cli/src/tui/console`.
- Existing conversation parsing through `@ai-devkit/agent-manager`.
- Existing console tests and manual terminal run of `ai-devkit agent console`.

## Planning Status

All tasks complete. 16 console test files (106 tests) pass. CLI lint exits 0. Feature lint passes. Manual PTY smoke verified two-pane layout and clean exit; selected-agent detail focus deferred due to PTY agent-scan limitation — recommended for real-terminal verification before broad rollout.
