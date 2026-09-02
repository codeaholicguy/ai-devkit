---
phase: planning
title: Memory Hybrid Noise Reduction Plan
description: Track diagnosis, isolated experiments, selected implementation, and release validation
---

# Memory Hybrid Noise Reduction Plan

## Completed Work

- [x] Reproduce the 0.59.0 lexical and semantic expanded-100 rows.
- [x] Run all queries with retrieval explanations against one shared seeded corpus.
- [x] Identify all six judged-irrelevant hybrid top-three appearances and classify channel membership.
- [x] Correct the coverage interpretation using raw judged and returned slot counts.
- [x] Test equal `k=10` in isolation and record 88/97/98 with 4.0% irrelevant.
- [x] Test asymmetric lexical/semantic 60/90 in isolation and record 86/97/98 with 4.0% irrelevant.
- [x] Revert the asymmetric experiment before the next candidate.
- [x] Test a semantic-only cosine floor of 0.50 and record 88/97/98 with 3.3% irrelevant.
- [x] Test the combined floor plus `k=10` and record 88/97/98 with 2.5% irrelevant.
- [x] Add deterministic unit tests for both selected ranking rules.
- [x] Prove the tests fail when the selected implementation is removed.
- [x] Run final build, full test, lint, and E2E gates after documentation changes.
- [x] Publish the branch and open a review request without merging.

## Dependencies and Sequencing

The real model and expanded-100 fixture were required only for empirical selection. Unit tests use explicit candidates and ranks, so routine validation does not download or execute the model. A released-version leaderboard row depends on the next ai-devkit release and is deliberately deferred.

## Risks and Mitigations

- **Sparse judgments:** include raw counts and coverage in review evidence; expand pooled judgments separately.
- **Threshold overfitting:** retain lexical matches regardless of cosine and preserve all measured hit metrics.
- **Ranking regression:** deterministic tests cover the threshold boundary and deep dual-channel agreement.
- **History noise:** rejected experiments remain as evidence, with explicit revert commits; reviewers can evaluate the final diff against `origin/main` independently.
