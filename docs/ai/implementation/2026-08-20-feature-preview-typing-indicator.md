---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup

- Work in `feature-preview-typing-indicator` and use the repository Node/npm toolchain.
- No new dependencies or configuration are required.
- Run `npm ci` and `npm run build` before full workspace gates.

## Code Structure
**How is the code organized?**

- `packages/cli/src/tui/console/PreviewActivityIndicator.tsx`: isolated activity leaf and pure frame selection.
- `packages/cli/src/tui/console/PreviewPane.tsx`: RUNNING mapping, adjusted body budget, and leaf mount.
- `packages/cli/src/__tests__/tui/console/PreviewActivityIndicator.test.tsx`: pure logic and timer lifecycle.
- `packages/cli/src/__tests__/tui/console/PreviewPane.test.ts`: status, geometry, scroll, and render-scope integration.

## Implementation Notes
**Key technical details to remember:**

### Core Features
- Frame selection uses immutable braille and ASCII arrays with modular indexing; `TERM=dumb` selects ASCII.
- The memoized leaf owns frame index and a 160 ms interval, resets on activation, and clears the interval on deactivation/unmount.
- `PreviewPane` subtracts exactly one line from the conversation viewport while the selected agent is `RUNNING`, then renders the activity leaf after the body.

### Patterns & Best Practices
- Timer state remains below the memoized preview boundary, so ticks cannot rerender the parent or recompute Markdown rows.
- Activity chrome never enters `buildPreviewRows`, row-count compensation, or scroll offset calculations.
- TDD red-green-refactor cycles and existing Ink `PassThrough` render utilities were used.

## Integration Points
**How do pieces connect?**

- Existing `AgentInfo.status` is the sole integration input. There are no API, database, or third-party changes.

## Error Handling
**How do we handle failures?**

- Inactive or absent agents render no activity row. `TERM=dumb` is handled as a deterministic display fallback; no errors or logging are introduced.

## Performance Considerations
**How do we keep it fast?**

- A local leaf interval limits 6.25 Hz updates to one glyph row.
- The parent preview's existing message memoization remains intact; tests assert stable parent-render, Markdown-layout, and scroll-clamp counts across ticks.

## Security Notes
**What security measures are in place?**

- No security boundary or sensitive data changes.
