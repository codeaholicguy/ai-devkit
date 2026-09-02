---
phase: testing
title: Memory Hybrid Noise Reduction Testing
description: Validate deterministic ranking behavior, regression safety, and expanded-100 quality
---

# Memory Hybrid Noise Reduction Testing

## Automated Coverage

- [x] Suppress a semantic-only candidate below cosine 0.50.
- [x] Admit a semantic-only candidate at the 0.50 boundary.
- [x] Preserve a low-similarity candidate independently found by lexical retrieval.
- [x] Rank lexical rank 1 above a candidate appearing at rank 20 in both channels.
- [x] Preserve deterministic fusion and existing lexical tie protection.
- [x] Regression proof: restoring baseline `k=60` and removing the guard makes exactly the two new tests fail.
- [x] Final `npm run build`: all six projects built successfully.
- [x] Final `npm test`: 174 test files and 2,165 tests passed across six projects.
- [x] Final `npm run lint`: all six projects passed with zero errors and three pre-existing CLI warnings.
- [x] Final `npx vitest run --config e2e/vitest.config.ts`: 1 file and 41 tests passed.

Unit tests construct candidates and ranks directly. They do not load MiniLM or depend on floating model output.

## Expanded-100 Evidence

| Configuration | hit@1 | hit@3 | hit@5 | Known bad | Judged irrelevant | Bad / returned slots | Coverage | Zero |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Dev semantic baseline | 88% | 97% | 98% | 6 | 4.7% | 2.00% | 42.3% | 0% |
| Equal RRF `k=10` | 88% | 97% | 98% | 5 | 4.0% | 1.67% | 42.0% | 0% |
| Asymmetric RRF 60/90 | 86% | 97% | 98% | 5 | 4.0% | 1.67% | 41.7% | 0% |
| Semantic-only cosine >=0.50 | 88% | 97% | 98% | 4 | 3.3% | 1.82% | 55.5% | 1% |
| Combined selected policy | 88% | 97% | 98% | 3 | 2.5% | 1.36% | 55.0% | 1% |

The selected policy has no hit@3 regression and reduces the conditional noise rate by 2.2 percentage points. The 1% zero rate is the `169.254.169.254` query, whose former semantic results contained no relevant top-five answer.

## Coverage Caveat

The benchmark judges only returned query/result pairs that have explicit fixture labels. Hybrid baseline coverage is 127/300 top-three slots, not evidence that the other 173 are relevant or irrelevant. Across the pooled lexical and hybrid top-three results, 233 of 360 unique pairs still need judgments. Review decisions therefore use raw known-bad counts, conditional rate, returned-slot rate, coverage, and recall together.

## Release Follow-up

After the next npm release, rerun expanded-100 using the released package and add that released-version result to the benchmark leaderboard. Dev-mode experiment files remain outside the repository leaderboard.
