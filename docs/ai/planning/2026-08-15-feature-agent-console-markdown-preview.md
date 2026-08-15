---
phase: planning
title: Agent Console Markdown Preview Plan
description: Ordered TDD implementation, integration, safety, responsiveness, documentation, and verification tasks.
---

# Agent Console Markdown Preview Plan

## Milestones

- [x] Milestone 1: Pure safe Markdown-to-terminal-row renderer is complete.
- [x] Milestone 2: Width-aware preview integration preserves scrolling and visible-row-only rendering.
- [x] Milestone 3: Documentation, coverage, verification, and review gates pass.

## Task Breakdown

### Phase 1: Markdown row foundation

- [x] **Task 1.1 — Establish direct dependencies and core inline rendering.**
  - Outcome: CLI directly declares the parser/display-width dependencies; headings, paragraphs, bold, emphasis, and inline code produce styled spans.
  - Dependencies: approved design; repository Marked precedent.
  - TDD: add a focused failing `markdownPreview.test.ts`, run red, install dependencies, implement the minimum parser/token mapping, run green/refactor.
  - Validation: targeted unit test, CLI lint/typecheck as useful.
  - Testing scenarios: Markdown parsing/layout items 1 and 2 (inline portion).
- [x] **Task 1.2 — Add fenced code, lists, blockquotes, and links.**
  - Outcome: remaining MVP constructs render as deterministic prefixed rows and inert label-plus-URL spans.
  - Dependencies: Task 1.1 token/span model.
  - TDD: one failing behavior at a time for code, lists, quotes, and links, followed by minimal implementation and refactor.
  - Validation: targeted renderer tests.
  - Testing scenarios: Markdown parsing/layout items 2–4.

### Phase 2: Safety and physical terminal layout

- [x] **Task 2.1 — Add safe unsupported/malformed fallbacks and control sanitization.**
  - Outcome: HTML/images/tables/malformed source remains readable and inert; ANSI, OSC, and unsafe C0 characters cannot affect the terminal.
  - Dependencies: Tasks 1.1–1.2.
  - TDD: failing fixtures for each unsafe/fallback class before production changes.
  - Validation: targeted safety tests and coverage branches.
  - Testing scenarios: Markdown parsing/layout items 5–7 and 9.
- [x] **Task 2.2 — Add display-width wrapping with styled-span preservation.**
  - Outcome: content rows reflect physical terminal width, including prefixes, hanging indentation, Unicode, long URLs, and narrow widths.
  - Dependencies: stable span/block output from Task 2.1.
  - TDD: failing narrow/Unicode/long-token fixtures, then minimum wrapping implementation.
  - Validation: targeted layout tests at narrow and normal widths.
  - Testing scenarios: Markdown parsing/layout item 8; viewport narrow-width scenario.

### Phase 3: Preview integration and optimization

- [x] **Task 3.1 — Integrate styled rows and explicit content width.**
  - Outcome: `ConsoleApp` passes `inputInnerWidth - 2`; `PreviewPane` memoizes parse/layout by messages and width, preserves all existing states/headers, and renders styled spans.
  - Dependencies: Task 2.2.
  - TDD: failing Ink render/width tests before component edits.
  - Validation: existing and new `PreviewPane` render tests.
  - Testing scenarios: all integration tests plus viewport clamp/indicator behavior.
- [x] **Task 3.2 — Prove viewport-only scroll work.**
  - Outcome: viewport slicing occurs before Ink row construction; offset-only rerenders read/lay out source once and reuse stable row objects; append/bottom behavior remains unchanged.
  - Dependencies: Task 3.1.
  - TDD: failing instrumentation and off-viewport render tests before optimization edits.
  - Validation: component rerender, row identity, visible-content, clamp, indicator, and appended-row tests.
  - Testing scenarios: all viewport/responsiveness and performance scenarios.

### Phase 4: Documentation and quality gates

- [x] **Task 4.1 — Reconcile implementation/testing documents.**
  - Outcome: changed files, decisions, deviations, edge cases, test links, checkboxes, and results are current.
  - Dependencies: implementation tasks complete.
  - Validation: feature lint.
- [x] **Task 4.2 — Run testing, coverage, build, lifecycle lint, and holistic review.**
  - Outcome: fresh evidence supports readiness; no blocking design, security, performance, integration, or test finding remains.
  - Dependencies: Task 4.1.
  - Validation: targeted tests/coverage, CLI lint/build, feature-doc lint, relevant broader tests, git diff review.

## Dependencies

- Task order is intentional: tokens/spans → remaining syntax → safety → wrapping → integration → optimization proof → docs/quality gates.
- `marked` and `string-width` must be direct CLI dependencies, not undeclared transitive imports.
- The existing 20-message conversation hook, polling hooks, focus routing, and narrow-mode visibility are not modified.
- Rebase against current `origin/main` before push; if open PR #162 lands, preserve its cached-preview props/metadata during conflict resolution.

## Timeline & Estimates

- Foundation and syntax: small-to-medium.
- Safety/wrapping: medium and highest correctness risk.
- Integration/optimization tests: medium.
- Documentation/verification/review: small-to-medium.

## Risks & Mitigation

- **Styled wrapping corrupts formatting or widths:** keep pure span/row helpers and test Unicode, prefixes, long tokens, and multiple widths.
- **Malformed tokens crash traversal:** exhaustive safe defaults plus top-level parser fallback.
- **Terminal injection:** sanitize before parsing and again at emitted span boundaries; never emit terminal hyperlinks.
- **Offset rerenders regress CPU:** make memo dependencies explicit and test invocation/object identity.
- **Open console PR conflict:** minimize surface, inspect PR #162, fetch/rebase immediately before submission, and rerun validation.
- **Dependency churn:** align Marked major with existing repository usage and declare only required runtime packages.

## Resources Needed

- One isolated feature worktree on `feature-agent-console-markdown-preview`.
- Existing Ink/Vitest test helpers and console responsiveness tests.
- Marked token patterns already used by `packages/channel-connector`.
- AI DevKit task tracing and lifecycle documentation.

## Progress Summary

All planned tasks are complete. Forty-two focused tests plus the full 984-test CLI coverage suite cover the renderer, malformed fallback, preview integration, exact terminal width, preserved states, current viewport behavior, offset-only zero parse/layout calls, and visible-row-only Ink output. Phase 9 found no blocking or important issues. No blockers or scope changes are known.
