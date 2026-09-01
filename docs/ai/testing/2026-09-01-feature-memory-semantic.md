---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals

**What level of testing do we aim for?**

- Unit coverage for every pure retrieval/storage primitive (fusion, similarity, (de)serialization, embedding text construction, checksum/pin verification, mean-pooling).
- Integration coverage for every degradation path (offline model, corrupt embedding, stale embedding version, oversized corpus) and for the migration, write-invalidation, and backfill behaviors.
- Command-level coverage for the CLI's semantic-enabled vs. disabled branching, including the operator commands (`semantic status`, `semantic download`, `reembed --force`).
- Offline benchmark coverage (expanded-100, 1,000-row latency) as the acceptance-criteria evidence for the requirements doc's measurable outcomes — these are run manually against the built CLI rather than as part of the automated suite, since they require the real ONNX runtime and a seeded large corpus.

## Unit Tests

**What individual components need testing?**

### `services/semantic.ts` (`tests/unit/semantic.test.ts`)
- [x] Builds deterministic embedding text with sorted, trimmed tags.
- [x] Round-trips a 384-dim Float32Array through BLOB (de)serialization and rejects the wrong dimension.
- [x] Cosine similarity is correct for normalized vectors.
- [x] RRF fusion is deterministic across repeated runs and protects a shared lexical/semantic hit's lexical rank on ties.

### `services/model.ts` / `services/embedder.ts` (`tests/unit/model.test.ts`)
- [x] Pins model identity, revision, quantization, and dimension (`MODEL_ID`, `MODEL_REVISION` format, `MODEL_DIMENSION`, `MODEL_VERSION`).
- [x] `inspectModelFiles` correctly reports missing files; `ensureModelFiles` downloads and verifies them atomically, and the cache is recognized as ready afterward.
- [x] `ensureModelFiles` rejects a download whose bytes don't match the pinned checksum.
- [x] `normalizeEmbedding` normalizes correctly and rejects an all-zero vector.
- [x] `meanPoolAndNormalize` pools only attention-unmasked token vectors.

### `services/config.ts` (`tests/unit/config.test.ts`)
- [x] Defaults to disabled for missing or malformed `.ai-devkit.json`.
- [x] Enables semantics only for the exact boolean `true` (rejects the string `"true"`).

### CLI config (`packages/cli/src/__tests__/lib/Config.test.ts`)
- [x] `getMemorySemanticEnabled()` returns `false` by default, `true` only for `{ memory: { semantic: true } }`, and `false` for `{ memory: { semantic: 'true' } }`.
- [x] An explicit project value overrides the global config (project `true` wins over global `false`).
- [x] An unset/malformed project value falls back to the global config (global `true` is inherited when the project value is absent).
- [x] Neither project nor global config setting `semantic` defaults to `false`.

## Integration Tests

**How do we test component interactions?**

### Migration (`tests/integration/semantic-storage.test.ts`)
- [x] Migration 002 adds nullable `embedding`/`embedding_version` columns without altering existing rows or the schema version sequence.

### Hybrid search and maintenance (`tests/integration/semantic-search.test.ts`)
- [x] Retrieves a semantic-only paraphrase match and exposes `--explain`-style rank/score details.
- [x] Degrades to lexical results and reports `status: 'unavailable'` when the embedder throws.
- [x] `updateKnowledge` invalidates an embedding on a content/tag change but retains it for a scope-only update.
- [x] `reembedKnowledge` backfills missing embeddings, skips already-current rows on a repeat run, and force-recomputes everything with `--force`.
- [x] `storeKnowledgeSemantic` writes a compatible embedding in the same operation as the memory row.
- [x] `getSemanticStatus` reports `modelReady: false` without loading the runtime when the model cache directory is missing (via the `modelsRoot` test seam).
- [x] A corrupt embedding (wrong byte length) is skipped from semantic candidates without losing the lexical hit.
- [x] Above `MAX_SEMANTIC_CORPUS` (5,000) eligible rows, search reports `corpus-too-large`, serves lexical-only, and never calls the embedder (asserted via a spy).

### CLI command wiring (`packages/cli/src/__tests__/commands/memory.test.ts`)
- [x] `memory search --explain` uses the async hybrid path and returns `retrievalMode`/`semantic` fields when semantic is enabled.
- [x] `memory store` awaits the semantic-enabled async command before printing its result.
- [x] `memory update` awaits the semantic-enabled async command before printing its result (added in this pass — previously untested; the mock import was flagged unused by lint).
- [x] `memory semantic status`, `memory semantic download`, and `memory reembed --force` invoke their respective API functions with the resolved `dbPath`/`force` options.
- [x] Existing lexical-only command behavior (semantic disabled) is unchanged — covered by the pre-existing store/search/update test cases in the same file.

## End-to-End Tests

**What user flows need validation?**

- [x] Full CLI e2e suite (`e2e/vitest.config.ts`) exercises `ai-devkit` commands end-to-end, including memory commands, against the built CLI binary — see Fresh Validation Output below.
- [ ] Manual E2E run of `memory semantic download` against a real network to confirm the live Hugging Face fetch and checksum path (covered functionally by unit tests against a fake `fetchImpl`; not re-run in this pass since the model/thresholds are frozen and unchanged).

## Test Data

**What data do we use for testing?**

- Deterministic fixed-vector `LocalEmbedder` fakes (e.g., `first`/`second` one-hot 384-dim vectors) for all fusion/degradation/backfill tests, so semantic ranking assertions never depend on the real model's actual embedding values.
- A synthetic 5,001-row corpus (bulk-inserted directly via the DB connection) to exercise the `corpus-too-large` path without needing a real large memory store.
- The expanded-100 benchmark corpus (100 memories, 100 queries, including paraphrase and exact-identifier query types) for the offline gate evidence below.

## Test Reporting & Coverage

**How do we verify and communicate test results?**

### Model selection gate (frozen; not re-run in this pass, per the requirements doc's non-goals)

| Model | Paraphrase nDCG@5 | Paraphrase recall@5 | Result |
|---|---|---|---|
| Lexical-only baseline | 0.6576 | 0.68 | — |
| MiniLM hybrid (RRF) | 0.7590 (+15.41%) | 0.76 (+11.76%) | **Pass — selected** |
| BGE hybrid (RRF) | +8.75% delta | +5.88% delta | **Fail — rejected** |

Overall MRR@5 improved 0.8637 → 0.9275. Identifier-exact hit@1 held at 0.96 with zero per-query regressions; repeated fusion runs produced identical rankings (determinism verified).

### Built-CLI benchmark (frozen; expanded-100 corpus)

Published 0.57.1 lexical baseline (hit@1 81% / hit@3 91% / hit@5 96% / zero-result 1%) improved to MiniLM hybrid hit@1 88% / hit@3 97% / hit@5 98% / zero-result 0%. Judged-irrelevant top-three rose from 2.9% to 4.7% (an accepted semantic-recall trade-off, tracked as a monitoring note rather than a regression, per the design doc's fail-open philosophy). One-shot CLI p95 was 1,886 ms and seed time 76.6 s for the 100-memory corpus (process/ONNX cold-start cost, not the search-latency SLA).

### 1,000-row warm latency gate (frozen)

100 searches after 5 warmups: median 21.85 ms, p95 29.78 ms, max 33.51 ms — under the <50 ms budget from the requirements doc.

### Fresh validation output (this pass, run against the simplified code)

Executed after the simplification commits in this pass, before any doc-only changes:

- `npm run build` — 6/6 projects built successfully (channel-connector, memory, agent-manager, task-manager, memory-dashboard, cli).
- `npm test` (workspace-wide) — all suites green:
  - `@ai-devkit/memory`: 18 test files, 156 tests passed.
  - `@ai-devkit/task-manager`: 8 test files, 112 tests passed.
  - `@ai-devkit/agent-manager`: 41 test files, 631 tests passed.
  - `@ai-devkit/memory-dashboard`: 3 test files, 22 tests passed.
  - `ai-devkit` (cli): 91 test files, 1,091 tests passed (was 1,087 before this pass's added `memory update` semantic test and the three global/project precedence tests).
- `npm run lint` (workspace-wide) — 0 errors; 3 pre-existing warnings unrelated to this feature (`init.test.ts`, `channel.ts`, `util/skill.ts`); the pre-existing `memoryUpdateCommandAsync` unused-import warning in `memory.test.ts` is resolved by this pass's added test.
- `npx vitest run --config e2e/vitest.config.ts` — 1 test file, 41 tests passed.

No eval-gate number above changed as a result of this pass: the changes touched unused embedder options and an unreachable branch, an unused error subclass, an unused lifecycle method, the `memory.semantic` global/project resolution, and added tests for both; none of it touched `fuseSearchResults`, the degradation paths in `searchKnowledgeHybrid`, the migration, or the pinned model/thresholds.

## Manual Testing

**What requires human validation?**

- Confirm `memory semantic download` output/UX against a live network in an environment without a pre-warmed cache (not required for this pass; frozen model/checksums make this low-risk).

## Performance Testing

**How do we validate performance?**

- Benchmarks are run manually via the built CLI (expanded-100 and 1,000-row corpora) rather than as part of the automated test suite, since they require the real ONNX runtime, a downloaded model, and a seeded corpus of realistic size. Re-run these benchmarks if the model, fusion constant, or corpus cap ever changes (none did in this pass).

## Bug Tracking

**How do we manage issues?**

- The one known, accepted trade-off (judged-irrelevant top-three results rising from 2.9% to 4.7% under semantic hybrid search) is tracked here as a monitoring note rather than a tracked bug, since it was an explicit, gate-evidenced trade-off accepted at model-selection time, not a defect.
