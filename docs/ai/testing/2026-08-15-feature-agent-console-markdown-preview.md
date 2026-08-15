---
phase: testing
title: Agent Console Markdown Preview Testing Strategy
description: Focused syntax, safety, viewport, responsiveness, integration, and coverage validation.
---

# Agent Console Markdown Preview Testing Strategy

## Test Coverage Goals

- Target 100% branch/function coverage for the new Markdown/layout module.
- Preserve existing `PreviewPane` render and viewport regression coverage.
- Test user-observable output and style-bearing row data, with mocks only for invocation counting where necessary.

## Unit Tests

### Markdown parsing and layout

- [x] Render headings, bold, emphasis, and combined inline spans.
- [x] Render inline code and fenced code blocks, including optional language labels without highlighting.
- [x] Render ordered/unordered lists with hanging indentation and blockquotes with terminal prefixes.
- [x] Render links as safe label-plus-destination text.
- [x] Fall back safely for malformed Markdown and unsupported tables.
- [x] Preserve raw HTML and images only as sanitized inert text fallbacks.
- [x] Strip ANSI, OSC, and unsafe C0 terminal control sequences.
- [x] Wrap styled spans by terminal display width at narrow and normal widths.
- [x] Preserve blank lines and empty message bodies without crashes.

### Viewport and responsiveness

- [x] Clamp offsets and show above/below/continuation indicators using rendered physical rows.
- [x] Keep the bottom pinned at offset zero and adjust positive offsets when rendered rows append.
- [x] Slice rows before Ink element creation and render no off-viewport content.
- [x] Prove an offset-only rerender does not re-read Markdown source or rebuild stable laid-out row objects.
- [x] Prove width changes rebuild layout and messages changes rebuild only the active bounded preview result.

## Integration Tests

- [x] Render a mixed user/assistant conversation with role headers, timestamps, Markdown styles, and separators.
- [x] Preserve loading, empty, error, selected-agent, and channel-connected states.
- [x] Preserve `PreviewSection` width plumbing and current focus/scroll callback behavior.
- [x] Preserve the existing 20-message tail and polling behavior by leaving the conversation hook contract unchanged.

## End-to-End Tests

- [x] Run the CLI console render suite at normal terminal width.
- [x] Run narrow-width fixtures to verify wrapping and viewport indicators without changing narrow-mode behavior.
- [x] Regression-check open console responsiveness integration points through current targeted suites.

## Test Data

- Mixed Markdown fixture containing all supported constructs.
- Malformed fence/emphasis/link fixtures.
- Raw HTML, image, ANSI/OSC, C0 control, Unicode, long-word, and long-URL fixtures.
- Existing `AgentInfo`, `ConversationMessage`, channel status, and fetch-error fixtures.

## Test Reporting & Coverage

- `npm test --workspace ai-devkit -- PreviewPane.test.ts markdownPreview.test.ts`
- `npm run test:coverage --workspace ai-devkit -- PreviewPane.test.ts markdownPreview.test.ts`
- `npm run lint --workspace ai-devkit`
- `npm run build --workspace ai-devkit`
- `npx ai-devkit@latest lint --feature agent-console-markdown-preview`
- `npm run test:coverage --workspace ai-devkit` — exit 0; 82 files and 984 tests passed. Global coverage: 74.72% statements, 65.12% branches, 74.46% functions, 75.82% lines.
- Targeted three-file coverage ran 42 tests and reported `markdownPreview.ts` at 94.28% statements / 82.14% branches / 97.22% functions / 95.9% lines and `PreviewPane.tsx` at 96.55% statements / 84.41% branches / 94.44% functions / 98.18% lines. That targeted-only command exits 1 because unrelated unexecuted CLI modules reduce package-global coverage below 60%; the full suite above is the valid threshold result.
- `npm run lint --workspace ai-devkit` — exit 0; no errors, five pre-existing unused-catch warnings.
- `npm run build --workspace ai-devkit` — exit 0; 196 files compiled and declaration typecheck passed.
- `npx ai-devkit@latest lint --feature agent-console-markdown-preview` — exit 0.
- Remaining changed-file coverage gaps are the unavoidable single-grapheme-wider-than-viewport branch and defensive lexer-throw fallback; both degrade to visible literal output and are conscious non-blocking limitations.

## Manual Testing

- Inspect stripped Ink output for readable hierarchy, list/quote/code prefixes, safe link fallback, and correct scroll indicators.
- Confirm unsupported content remains inert and readable.
- Completed through deterministic Ink `renderToString` fixtures at normal/narrow widths: Markdown punctuation is removed, role/timestamp/channel chrome remains, and off-viewport sentinel content is absent.

## Performance Testing

- Use invocation/object-identity assertions during component rerender: changing only `scrollOffset` must produce zero additional source reads and reuse the prior laid-out rows.
- Assert only viewport rows appear in rendered output; the active source remains capped by the existing hook at twenty messages.

## Bug Tracking

- Any safety, offset-only recomputation, viewport overflow, or state regression is blocking.
- Styling preferences that do not affect readability or contracts are non-blocking follow-ups.
