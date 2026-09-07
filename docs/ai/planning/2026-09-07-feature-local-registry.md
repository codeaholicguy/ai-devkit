---
phase: planning
title: Local Folder Skill Registry Plan
description: TDD plan for explicit read-only local sources
---

# Plan

## Milestones and Tasks

- [x] **M1 Source boundary**
  - [x] T1: TDD source parser and explicit file:/Git classification (AC-01, SR-06, SR-12).
  - [x] T2: TDD cwd/config/template normalization and canonical duplicate rejection (AC-02–05).
  - [x] T3: Document canonical storage and move/re-add semantics.
- [x] **M2 Runtime flows**
  - [x] T4: TDD read-only local preparation, no Git calls, and prep-once compatibility (AC-06, SR-01–05).
  - [x] T5: TDD fixture discovery/install, missing/empty errors, containment, direct-only and bounded reads (AC-07, SR-07–10).
  - [x] T6: TDD focused/full/seed/TTL index behavior using actual source roots (AC-08).
  - [x] T7: TDD selected/local-only/mixed update behavior (AC-09).
- [x] **M3 Removal and surfaces**
  - [x] T8: TDD config/index cleanup and ID-derived cache-only deletion; snapshot local fixtures (AC-10, SR-01–04).
  - [x] T9: TDD status and installed provenance (AC-11–12, SR-11).
  - [x] T10: CLI e2e normalization/error/removal journeys and user docs.
  - [x] T11: Reconcile docs; implementation check, coverage, build, tests, lint, e2e, final review.

## Dependencies

T1 precedes all source-aware flows. T4–T5 precede index/update. T8 remains ID-derived. Documentation follows stable CLI behavior. No external API or database migration exists.

## TDD Evidence

Every production change follows focused red, green, refactor commands recorded in implementation/testing docs. Final evidence: npm run build, npm test, npm run lint, npm run test:e2e, and focused coverage.

## Risks

- Local mutation: snapshot fixtures and spy on Git/write/delete boundaries.
- Symlink escape: canonical containment before read/install.
- Stale search: local entries refresh independently of remote TTL/seed.
- Compatibility: non-file values stay on Git branch.
- Oversized sources: streamed direct iteration and metadata-size limits.
- Scope: no provider hierarchy, watcher, object schema, or Windows/UNC support.

## Progress

All tasks are complete. Final review found no blocking issues. The only validation limitation is that the repository's test:coverage script forwards --coverage as an npm config flag and produces no trustworthy percentage.
