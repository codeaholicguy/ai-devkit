---
phase: implementation
title: Agent Console Markdown Preview Implementation
description: Current implementation structure, decisions, integration points, safety, and performance notes.
---

# Agent Console Markdown Preview Implementation

## Development Setup

- Worktree: `.worktrees/feature-agent-console-markdown-preview`
- Branch: `feature-agent-console-markdown-preview`
- Bootstrap: `npm ci` (completed; Husky could not update the shared sandboxed git config, while package installation completed).
- Runtime dependencies added: `marked` aligned with the repository's existing channel-connector major version and `string-width` for terminal display columns.

## Code Structure

- `packages/cli/src/tui/console/render/markdownPreview.ts`: pure Markdown token-to-styled-span/row renderer (in progress).
- `packages/cli/src/__tests__/tui/console/render/markdownPreview.test.ts`: focused TDD specifications.
- `PreviewPane.tsx`: memoized Markdown row construction, viewport slicing, and visible styled-span rendering.
- `PreviewSection.tsx` / `ConsoleApp.tsx`: explicit preview content-width plumbing from terminal layout.

## Implementation Notes

### Completed

- Tasks 1.1–1.2: Marked lexer traversal for headings, paragraphs/text, bold, emphasis, inline code, fenced code, ordered/unordered lists, blockquotes, and links.
- Code fences produce optional dim language labels and literal warning-colored, indented lines without highlighting.
- Lists use deterministic bullets/numbers and continuation indentation; blockquotes use a dim terminal bar; links display styled labels plus inert plain destinations.
- Styled spans reuse existing `TUI_COLORS`; no ANSI or terminal hyperlink output is generated.
- TDD evidence: five focused behaviors each failed before their minimum implementation and now pass together.
- Tasks 2.1–2.2: raw HTML/table source stays inert, images become dim label/destination fallbacks, VT/C0 controls are removed before parsing, empty content retains one row, and styled rows wrap by grapheme display width with hanging prefixes.
- Markdown soft/source line breaks are split before viewport accounting so one row never hides multiple physical terminal lines.
- Current focused evidence: 11 tests passed.

### In progress / next

- Formal implementation alignment, coverage, broader regression checks, and review.

### Patterns & Best Practices

- Pure token traversal and immutable span objects.
- Unsupported block tokens retain sanitized raw lines; images have an explicit inert fallback.
- Production behavior is added only after its focused test fails for the intended reason.

## Integration Points

- Marked is a direct CLI runtime dependency; no channel-connector internals are imported.
- Conversation acquisition, polling, 20-message tailing, focus routing, and channel state are unchanged.
- `computeLayout` derives `previewContentWidth` from `inputInnerWidth - 2`; `PreviewSection` passes it directly to `PreviewPane`.

## Error Handling

- Parser errors fall back to sanitized literal rows; Marked also safely tokenizes incomplete Markdown without executing content.

## Performance Considerations

- The pure renderer wraps by Unicode grapheme display width, prefers word boundaries, and repeats or hangs list/quote/code prefixes where space permits.
- `PreviewPane` memoizes complete parse/layout rows only on `[messages, contentWidth]`; scroll offset is excluded.
- The viewport is computed from stable rows and sliced before Ink elements are mapped.
- No global cache exists; memory is bounded by the mounted active preview's current 20-message array and width.

## Security Notes

- Current output is data-only span objects.
- ANSI/OSC/VT controls and unsafe C0/C1 characters are removed before parsing; raw HTML remains literal, images are never fetched, and links remain inert display text.

## Design Deviations

None known. The implementation follows the selected direct-parser/pure-row architecture without adding excluded cache, anchoring, history, toggle, highlighting, or virtualization scope.

## Changed Files

- `packages/cli/package.json`, `package-lock.json`: direct `marked` and `string-width` runtime dependencies.
- `packages/cli/src/tui/console/render/markdownPreview.ts`: pure safe parser, styling, fallback, and display-width layout.
- `packages/cli/src/tui/console/PreviewPane.tsx`: styled row model, memoized parse/layout, viewport-first rendering.
- `packages/cli/src/tui/console/PreviewSection.tsx`, `ConsoleApp.tsx`: explicit content-width flow.
- `packages/cli/src/__tests__/tui/console/render/markdownPreview.test.ts`: syntax, safety, malformed, Unicode, and wrapping tests.
- `packages/cli/src/__tests__/tui/console/PreviewPane.test.ts`, `computeLayout.test.ts`: render/state/viewport/memoization/width integration tests.

## Verification to Date

- `npm test --workspace ai-devkit -- markdownPreview.test.ts PreviewPane.test.ts computeLayout.test.ts`: 40 tests passed before the final Phase 8 additions.
- `npm run build --workspace ai-devkit`: 196 files compiled; declaration typecheck passed.
- `npm run lint --workspace ai-devkit`: exit 0 with five pre-existing warnings and no errors.
- `npm run test:coverage --workspace ai-devkit`: 82 files / 984 tests passed; global coverage thresholds passed.
- Targeted changed-file coverage: `markdownPreview.ts` 95.9% lines and `PreviewPane.tsx` 98.2% lines.

## Phase 9 Review

- **Blocking findings:** none.
- **Important findings:** none.
- Design, requirements, and non-goals align with the final code.
- Export/caller tracing found only internal preview helper contracts; all in-repo callers and tests were updated.
- `marked@15.0.12` is deduplicated with the channel connector and `string-width@8.2.2` is a direct CLI dependency.
- No migration, persisted state, external API, irreversible operation, or rollback hazard exists.
- Entity-encoded controls stay literal, raw HTML stays text, images are never fetched, and links are plain displayed destinations.

## Conscious Limitations

- Markdown remains the explicit MVP subset; tables and other unsupported blocks display sanitized source text.
- Extremely narrow widths may place an indivisible wide grapheme beyond the requested single column because terminal graphemes cannot be split safely.
- Component-local layout is rebuilt on message-array or width changes; only offset-only rerenders are guaranteed to do zero parse/layout work.
- Numeric bottom-relative scroll offsets remain; frozen updates and semantic anchors are excluded by design.
