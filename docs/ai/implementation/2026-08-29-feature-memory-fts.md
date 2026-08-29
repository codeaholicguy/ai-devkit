---
phase: implementation
title: Memory full-text search implementation
description: Implementation record for staged lexical retrieval
---
# Implementation

## Setup and structure
Worktree `.worktrees/feature-memory-fts`, branch `feature-memory-fts`, fetched `origin/main`; bootstrapped with `npm ci` and a successful six-project `npm run build`.

Planned touchpoints: `services/search.ts` for pure builders, `handlers/search.ts` for orchestration, `services/ranker.ts` for coverage-aware scoring, `types/index.ts` for additive metadata, and focused memory tests.

## Notes
`services/search.ts` now exports deterministic token normalization plus strict and broad prefix-query builders. Unicode letter/number runs split punctuation and technical separators safely; a small English set, one-character noise, and duplicates are removed. The stopword set is the only new constant and directly serves sentence callers. Focused red evidence: 8/8 tests failed against the old builder. Green evidence: `npx vitest run tests/unit/search.test.ts`, 8/8 passed.

FTS errors will propagate through existing boundaries; all expressions remain bound parameters and broad retrieval remains bounded.

`services/search.ts` also exports parameterized broad SQL. Coverage uses correlated FTS rowid subqueries because SQLite rejects `MATCH` directly in the selected arithmetic expression. `handlers/search.ts` keeps one direct staged flow: strict candidates use the existing 2× pool; empty strict queries with at least two tokens use a 4× broad pool; noise-only input uses recent rows. `ranker.ts` multiplies normalized BM25 by token coverage before existing tag/scope boosts. `types/index.ts` adds required strategy metadata.

No schema, dependency, CLI presentation, eval, or semantic changes were made. The design was implemented without deviations. Shared `/tmp` initially caused unrelated SQLite I/O failures; after stale fixtures were removed, the memory package passed 133/133 tests.

Final review traced exported builders and result types through memory, CLI, and dashboard callers and found no blocking issues. Fresh final evidence: memory 133/133 with 100% coverage on the three changed runtime modules; workspace tests 6/6 projects; e2e 41/41; build and lint 6/6 projects; feature-doc lint clean.
