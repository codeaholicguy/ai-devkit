---
phase: planning
title: Telegram Markdown-first Chunking Plan
description: Implementation tasks for semantic Markdown chunking before Telegram HTML rendering
---

# Telegram Markdown-first Chunking Plan

## Milestones

- [x] Milestone 1: Requirements, design, and tests describe Markdown-first chunking.
- [x] Milestone 2: Adapter chunks Markdown source with marked tokens and sends independently rendered HTML chunks.
- [x] Milestone 3: Targeted tests, typecheck, lifecycle lint, review, commit, and PR are complete.

## Task Breakdown

### Phase 1: Documentation and Existing Behavior

- [x] Task 1.1: Capture requirements, design, testing scenarios, and implementation plan.
  - Outcome: lifecycle docs explain scope, non-goals, splitting strategy, and validation.
  - Validation: `npx ai-devkit@latest lint --feature telegram-markdown-chunking`.
  - Related tests: all testing doc scenarios.
- [x] Task 1.2: Inspect current Telegram adapter, renderer, package scripts, and existing tests.
  - Outcome: implementation reuses local patterns and dependencies.
  - Validation: source references recorded in implementation notes.

### Phase 2: TDD and Core Implementation

- [x] Task 2.1: Add failing tests for long fenced code, nested list code, paragraphs, Unicode/emoji, and unchanged normal markdown.
  - Outcome: tests fail against rendered-HTML chunking for the right reasons.
  - Validation: targeted Vitest run exits non-zero before production changes.
- [x] Task 2.2: Implement Markdown-first chunking with `marked` lexer tokens.
  - Outcome: each rendered HTML chunk is independently valid and within the Telegram max length.
  - Validation: targeted Vitest run exits zero.
- [x] Task 2.3: Preserve fallbacks for renderer failures and Telegram parse-entities errors.
  - Outcome: existing fallback tests still pass.
  - Validation: adapter test suite exits zero.

### Phase 3: Verification and Review

- [x] Task 3.1: Run typecheck and targeted package tests.
  - Outcome: changed package validates locally.
  - Validation: command output recorded in implementation/testing docs.
- [x] Task 3.2: Review implementation against design and update lifecycle docs.
  - Outcome: docs reflect actual files, decisions, deviations, and risks.
  - Validation: lifecycle lint passes.
- [x] Task 3.3: Commit, push, and open PR.
  - Outcome: branch `feature-telegram-markdown-chunking` has a PR ready for review.
  - Validation: commit SHA and PR URL reported.

## Dependencies

- Depends on existing `marked` dependency in `@ai-devkit/channel-connector`.
- Depends on existing `markdownToTelegramHtml` renderer remaining stable.
- No external Telegram API dependency for automated tests.

## Timeline & Estimates

- Documentation and code discovery: small.
- TDD and chunking implementation: medium, because recursive splitting must avoid malformed HTML and preserve fallbacks.
- Verification, review, PR: small to medium depending on CI/local runtime.

## Risks & Mitigation

- Risk: marked token `raw` values may differ across token kinds.
  - Mitigation: use `raw` where available and fall back to token text for known oversized splitters.
- Risk: rendered length may exceed source length due to HTML wrappers/entities.
  - Mitigation: validate by rendering every candidate before sending.
- Risk: plain text hard fallback could lose formatting.
  - Mitigation: use it only after semantic splitting and rendering cannot fit.

## Resources Needed

- Repo-local tests and typecheck.
- `npx ai-devkit@latest` docs/lint commands.
- GitHub CLI or configured forge CLI for PR creation.

## Progress Summary

Implementation tasks are complete through package verification, local review, commit, push, and PR creation. PR: https://github.com/codeaholicguy/ai-devkit/pull/125.
