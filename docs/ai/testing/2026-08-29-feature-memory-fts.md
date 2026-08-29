---
phase: testing
title: Memory full-text search testing
description: Regression plan for staged lexical retrieval
---
# Testing

Target: 100% statements, branches, functions, and lines for changed search modules, using temporary real SQLite databases.

## Unit scenarios
- [x] `?`, punctuation, straight/curly quotes, apostrophes, hyphens, POSIX/Windows paths, scoped packages, and dotted identifiers are safe.
- [x] Stopwords, one-character noise, duplicates, and noise-only input are deterministic.
- [x] Strict uses implicit AND; broad uses OR; SQL is parameterized and exposes coverage.
- [x] Coverage, BM25, context tags, and scope affect final order as designed.

## Integration scenarios
- [x] Strict success reports `strict`; empty strict retries broad and reports `broad`.
- [x] One meaningful token has no additional fallback; noise-only input reports `recent`.
- [x] Database/FTS errors propagate rather than returning recent memories.
- [x] Broad retrieval expands bounded candidates before top-k and preserves response fields.

## Mutation proof and gates
- [x] Restoring unsafe punctuation, AND-only behavior, or the swallowed-error catch fails its regression test.
- [x] Focused TDD tests and memory coverage pass: 40 tests and 100% statements/branches/functions/lines.
- [x] Required gates: build, full tests, lint, and e2e pass after stale shared `/tmp` fixtures were removed.

Fixtures remain small and deterministic; eval and semantic fixtures are out of scope.
