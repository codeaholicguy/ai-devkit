---
phase: requirements
title: Memory full-text search improvements
description: Reliable local lexical retrieval for natural-language agent queries
---
# Requirements

## Problem
Callers submit task sentences, but every prefix token is currently required. Stopwords or one unmatched word produce zero results; punctuation such as a trailing `?` can raise FTS syntax errors that are silently converted into unrelated recent memories.

## Goals
- Safely normalize sentences, punctuation, quotes, hyphens, paths, and package names.
- Drop a small English stopword set, one-character noise, and duplicate tokens.
- Search strict AND first; retry empty strict searches with OR when at least two meaningful tokens remain.
- Rank broad candidates by token coverage and BM25, then preserve existing tag/scope boosts.
- Use a larger bounded candidate pool before top-k and return `strict`, `broad`, or `recent` metadata.
- Keep exported pure `buildFtsQuery`/`buildSearchQuery` functions and a small lexical seam.
- Surface FTS errors; never disguise them as recent results.

## Non-goals
Eval harnesses, embeddings/semantic fusion, single-token fallback, synonyms, tokenizer/schema changes, storage enrichment, and CLI presentation changes.

## Acceptance criteria
- All assigned normalization cases produce valid parameterized FTS queries.
- Noise-only queries retain recent-item behavior and report `recent`.
- Strict success never runs broad retrieval; empty strict retrieval with 2+ tokens does.
- Broad scoring includes normalized coverage and BM25 before existing boosts.
- Existing response fields remain compatible and strategy metadata is additive.
- Changed code has full branch/line/function/statement coverage; six-project build, full tests, lint, and e2e pass.

## Constraints and resolved questions
SQLite FTS5 and its existing schema/tokenizer remain authoritative; there are no new runtime dependencies. English preprocessing is intentionally small. Candidate expansion is bounded. The sibling eval gates relevance and future semantic work may fuse lexical output. No material questions remain because scope and gates were explicitly assigned.
