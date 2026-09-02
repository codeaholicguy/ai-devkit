---
phase: requirements
title: Memory Hybrid Noise Reduction Requirements
description: Reduce judged-irrelevant hybrid search results without giving back semantic recall
---

# Memory Hybrid Noise Reduction Requirements

## Problem

Opt-in hybrid search improved expanded-100 hit@1/3/5 from 81/91/96 to 88/97/98 and removed the one empty response, but judged-irrelevant top-three results rose from 2.9% to 4.7%. Agents and CLI users benefit from the recall gain only if plausible but answer-wrong memories do not crowd the first results.

The percentage needs context. Lexical search produced 3 irrelevant results among 104 judged slots and 207 returned top-three slots. Hybrid produced 6 among 127 judged slots and 300 returned slots. Hybrid therefore had more judged slots in absolute terms, while its reported coverage fell from 50.2% to 42.3% because it filled more positions. The conditional 2.9% to 4.7% comparison is valid but sensitive to incomplete, non-random judgments.

## Goals

- Preserve the semantic-on hit@1/3/5 improvement.
- Reduce explicitly irrelevant top-three results using a small, deterministic fusion change.
- Keep semantic search opt-in, local, fail-open, and API-compatible.
- Keep lexical matches eligible even when their semantic similarity is low.

## Non-goals

- Changing the embedding model, storage schema, corpus cap, or public configuration.
- Adding a learned reranker or another inference pass.
- Publishing a benchmark leaderboard row before a released ai-devkit version exists.
- Treating unjudged results as irrelevant.

## Success Criteria

- Expanded-100 hit@3 must remain at least 96%, no more than 1 percentage point below the 97% semantic baseline.
- Judged-irrelevant top-three rate and raw irrelevant count must decrease.
- Identifier and paraphrase recall gains must remain represented in overall hit@1/3/5.
- Fusion remains deterministic and requires no model in unit tests.
- Existing semantic degradation behavior and external result shapes remain unchanged.

## Diagnosis

The six hybrid noisy appearances were:

| Case | Variant | Irrelevant result | Hybrid evidence |
|---|---|---|---|
| `errors-boundary-exact` | identifier | `errors-boundary-message` | semantic-only rank 2, cosine 0.334 |
| `obs-trace-exact` | identifier | `obs-trace-pii` | semantic-only rank 3, cosine 0.475 |
| `obs-trace-natural` | natural language | `obs-trace-dev` | lexical 3 + semantic 1, cosine 0.606 |
| `perf-batch-natural` | natural language | `perf-batch-interactive` | lexical 2 + semantic 2, cosine 0.544 |
| `dto-paraphrase` | paraphrase | `api-pagination` | lexical 3 + semantic 16, cosine 0.239 |
| `logging-natural` | natural language | `log-request-id` | lexical 9 + semantic 2, cosine 0.403 |

Two failures were weak semantic-only fillers. Four were lexical distractors reinforced by semantic rank. A global cosine floor was rejected because a noisy result scored 0.606 while a judged-relevant result scored as low as 0.238.

## Assumptions and Follow-up

The current fixture is sufficient for a release-gating comparison but not a final precision estimate. The benchmark should eventually judge the pooled lexical and hybrid top-three results: only 127 of 360 unique query/result pairs are currently judged, leaving 233 missing judgments.

