---
phase: planning
title: Memory full-text search plan
description: TDD plan for staged lexical retrieval
---
# Plan

## Milestones and tasks
- [x] Correctness: safe normalization/builders and honest FTS error propagation are complete via red/green and reverse-fix tests.
- [x] Retrieval: broad SQL, coverage scoring, strict-first orchestration, bounded candidate expansion, no single-token retry, existing boosts, and metadata are complete via red/green tests.
- [x] Verification and review: all required gates pass and holistic review found no blocking issues. Commit, rebase/revalidation, push, and PR remain publication steps.

Every production behavior requires a focused failing test first. The eval sibling may import pure builders but this branch will not edit its harness. Future semantic fusion gets no abstraction until it has a current caller.

## Risks
OR noise is limited by requiring two terms and coverage ranking. Technical-token damage is limited by conservative preprocessing. Public compatibility is additive. Candidate cost is bounded.

## Status
Implementation and review are complete. Reverse-fix tests fail for unsafe punctuation, disabled broad fallback, and swallowed FTS errors. After stale `/tmp` fixtures were removed, the full six-project test gate passed, including CLI 1,083/1,083 and memory 133/133; e2e passed 41/41; six-project build/lint, feature-doc lint, and 100% changed-module coverage also pass. Publication remains. Task tracing is unavailable.
