---
phase: requirements
title: Agent Console Markdown Preview
description: Render a safe, readable Markdown subset in agent conversation previews without regressing console responsiveness.
---

# Agent Console Markdown Preview

## Problem Statement

Developers reading agent responses in the Ink agent console currently see Markdown source as unstyled lines. Headings, lists, quotations, code, and links are harder to scan than they are in a rendered conversation. The preview's existing scrolling and memoized row construction are responsiveness-sensitive, so richer rendering must not turn scroll input into Markdown parsing or whole-transcript rendering work.

## Goals & Objectives

- Render a deliberately small, readable Markdown subset in conversation message bodies: headings, bold, emphasis, inline code, fenced code blocks, ordered and unordered lists, blockquotes, and links.
- Preserve role headers, timestamps, loading/empty/error states, channel status, the current 20-message tail, focus keys, scroll indicators, bottom-pinned behavior, polling semantics, and narrow-mode behavior.
- Lay out physical terminal rows before viewport slicing so scroll bounds and indicators reflect wrapped rendered content.
- Ensure changing only `scrollOffset` neither reparses Markdown nor rebuilds unchanged laid-out message rows, and create Ink elements only for visible viewport rows.
- Treat conversation content as untrusted display input: remove terminal control sequences and never interpret raw HTML or images.
- Keep rendered state bounded to the active preview through component-local memoization or another demonstrably small bounded cache.

### Non-goals

- Syntax highlighting, tables, raw HTML rendering, images, or a rendered/source toggle.
- Loading full conversation history.
- Frozen pending-update UX or semantic scroll anchors.
- A global multi-agent or multi-width render cache.
- Speculative virtualization beyond slicing the already bounded active preview rows.

## User Stories & Use Cases

- As a developer, I can scan agent headings, lists, quotes, code, and emphasis without mentally parsing Markdown punctuation.
- As a developer, I can follow links from a terminal-friendly label-and-destination fallback without terminal hyperlinks or unsafe escape sequences.
- As a developer scrolling older output, I retain the current viewport behavior while rapid offset changes avoid parse and layout work.
- As a developer using a narrow or resized terminal, I see correctly wrapped rows and accurate scroll indicators without changing existing narrow-mode navigation.
- As a developer viewing malformed or unsupported Markdown, I see safe readable text instead of a crash, raw control effects, HTML rendering, or image rendering.

## Success Criteria

- Focused unit tests cover every supported block and inline construct, malformed input, unsupported HTML/images, and terminal control sanitization.
- Ink render tests preserve the current role/timestamp/state/channel presentation and prove visible Markdown styling/fallback output.
- Viewport tests cover wrapping, visible-row slicing, scroll indicators, offset clamping, bottom-pinned append adjustment, and narrow width.
- An offset-only component rerender proves Markdown source is read once and the same laid-out row objects are reused.
- The CLI targeted tests, lint, typecheck/build, feature-doc lint, and relevant coverage command pass with fresh output.
- Memory remains bounded by the existing active 20-message preview and current width; no global render cache is introduced.

## Constraints & Assumptions

- The feature is built on current `origin/main`, which already includes preview-row memoization and console main-thread responsiveness work.
- Open PR #162 also touches `PreviewPane` for cached-state metadata. Its edits are orthogonal; this feature keeps component changes minimal and rebases before submission.
- A direct Markdown parser dependency is acceptable, but rendering is owned by a pure terminal row layer rather than a third-party Ink renderer.
- Terminal layout uses the explicit preview content width. Styled spans are wrapped before viewport slicing.
- Unsupported constructs degrade to sanitized text-oriented fallbacks. Link destinations are shown as plain text; no OSC 8 or other terminal control protocol is emitted.
- Routine styling decisions may use existing design-system colors and Ink text attributes.

## Alternatives Considered

1. **Direct parser plus pure terminal row layout (selected):** avoids writing a Markdown grammar while retaining deterministic wrapping, viewport slicing, and testable styles.
2. **Small internal parser:** reduces dependencies but creates avoidable correctness and malformed-input risk for nested inline syntax.
3. **Third-party Ink Markdown renderer:** quick visually, but obscures physical row counts and makes visible-row-only rendering and scroll invariants harder to prove.

## Questions & Open Items

No material product questions remain. The explicit MVP scope, safety rules, performance invariant, cache boundary, and non-goals are accepted as authoritative.
