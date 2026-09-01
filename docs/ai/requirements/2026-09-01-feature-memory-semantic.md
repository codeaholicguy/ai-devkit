---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

**What problem are we solving?**

- The `@ai-devkit/memory` search is lexical-only (SQLite FTS5 + BM25). Paraphrased queries that do not share vocabulary with a stored memory ("wire contracts" vs. a memory titled "Response serialization boundary") often fail to surface the right result, even though a semantic match exists.
- Agents querying memory before implementing a feature therefore miss relevant prior decisions whenever the phrasing differs from how the memory was written, which reduces the value of the memory system's core promise: don't repeat past guidance.
- Who is affected:
  - AI coding agents calling `memory_searchKnowledge` via MCP, whose recall quality directly gates whether they reuse stored conventions instead of re-deciding them.
  - CLI users running `ai-devkit memory search` who rely on ranked results being complete.

## Goals & Objectives

**What do we want to achieve?**

- Primary goals
  - Add an opt-in semantic retrieval channel that improves recall for paraphrased/synonym queries without weakening exact-match (identifier, error-code) retrieval.
  - Keep lexical strict-to-broad FTS as the default and as a protected channel inside the fused ranking — semantic search only ever adds to lexical results, never replaces them.
  - Run entirely locally: no network calls per query, no data leaving the machine.
  - Degrade to lexical-only automatically whenever the semantic path is unavailable (model not downloaded, corrupt cache, offline, oversized corpus) — semantic search must never turn a working lexical query into a failure.
- Secondary goals
  - Provide operator commands to inspect and manage the local model/embedding cache (`memory semantic status`, `memory semantic download`, `memory reembed [--force]`).
  - Provide an `--explain` mode exposing lexical rank, semantic rank, similarity, and fusion score for debugging ranking behavior.
- Non-goals (explicitly out of scope)
  - ANN/vector-index infrastructure (brute-force cosine over a capped corpus is sufficient at current memory-store scale).
  - Chunking long memory content into multiple embedded passages.
  - Configurable embedding models or fusion constants — one pinned model, one fusion formula.
  - Downloading the model automatically during `ai-devkit init`/migration; the download is lazy and triggered by first semantic use or an explicit `memory semantic download`.
  - Multilingual retrieval quality guarantees.

## User Stories & Use Cases

**How will users interact with the solution?**

- As an agent calling `memory_searchKnowledge`, I want paraphrased queries to still surface the relevant stored convention, so I don't re-derive or contradict a decision that already exists.
- As a developer, I want semantic search off by default so existing projects see no behavior change, latency change, or new dependency download unless I opt in.
- As a developer who opts in, I want the first semantic operation to lazily fetch a small pinned model so I don't have to run a separate setup step, but I also want an explicit `memory semantic download` for pre-warming CI/sandboxed environments without network access at query time.
- As a developer troubleshooting ranking, I want `memory search --explain` to show me why a result ranked where it did (lexical rank, semantic rank, cosine similarity, RRF score).
- Key workflows and scenarios
  - Enable via `.ai-devkit.json` (`memory.semantic: true`) → first search/store triggers model download → subsequent operations reuse the cached model and a warm in-process session.
  - Existing memory rows without an embedding remain fully searchable via lexical FTS; `memory reembed` backfills them in resumable batches.
  - Editing a memory's title/content/tags invalidates its embedding (must be recomputed); editing only its scope does not.
- Edge cases to consider
  - Semantic model not yet downloaded, download fails, or files are corrupted/checksum-mismatched.
  - Embedding BLOB is present but has the wrong byte length (corrupt row) or was computed by a since-replaced model version (stale).
  - Corpus grows large enough that brute-force cosine scanning would be too slow to keep search fast.
  - Query and memory rows both exist, but the model is offline mid-session (should degrade per-call, not crash the server).

## Success Criteria

**How will we know when we're done?**

- Measurable outcomes (from the expanded-100 benchmark: 100 memories, 100 queries, run through the built CLI)
  - Paraphrase nDCG@5 improves from 0.6576 to 0.7590 (+15.41%).
  - Paraphrase recall@5 improves from 0.68 to 0.76 (+11.76%).
  - Overall MRR@5 improves from 0.8637 to 0.9275.
  - Identifier-exact hit@1 stays at 0.96 with zero per-query regressions versus lexical-only.
  - Fusion ranking is deterministic: repeated runs over the same corpus/query produce identical rankings and scores.
- Acceptance criteria
  - `memory.semantic` config flag defaults to `false`; absent, non-boolean, or malformed config is treated as `false` (never silently enabled).
  - `memory_searchKnowledge` / `memory search` return `retrievalMode: 'hybrid'` and a `semantic` status object (`ready` | `unavailable` | `corpus-too-large`, `embeddingVersion`, `eligibleCount`, optional `reason`) whenever semantic is enabled.
  - Any semantic failure (model missing, download failure, corrupt embedding, corpus over the scan limit) falls back to lexical results for that call — never an error response, never a dropped result set.
  - Storing/updating a memory with `memory.semantic` enabled writes a compatible embedding in the same operation; disabling semantic afterward leaves lexical search fully functional.
  - `memory semantic status`, `memory semantic download`, and `memory reembed [--force]` are available and covered by tests.
  - Only an additive schema migration is used (nullable `embedding` BLOB + `embedding_version` TEXT); no existing migration is edited.
  - Warm p95 search latency stays under 50 ms at 1,000 rows with semantic enabled.
  - Embedding runtime (excluding the downloaded model cache) stays under 150 MB installed.
- Performance benchmarks
  - 1,000-row warm latency gate (100 searches after 5 warmups): median 21.85 ms, p95 29.78 ms, max 33.51 ms — under the 50 ms budget.
  - One-shot built-CLI benchmark (includes process + ONNX cold start): p95 1,886 ms; seed time 76.6 s for the 100-memory corpus. This process-startup cost is expected and is not the search-latency SLA measurement.

## Constraints & Assumptions

**What limitations do we need to work within?**

- Technical constraints
  - Must run offline after the model is cached; no per-query network dependency.
  - Must not add a native/platform-specific runtime dependency (rules out most native ONNX/BLAS bindings).
  - Must stay additive to the existing SQLite schema and lexical search path.
- Business constraints
  - No regression to the default (semantic-disabled) experience: same latency, same dependencies installed-and-loaded, same output shape.
- Time/budget constraints
  - Reuse the existing FTS ranking (`searchKnowledge`) as the lexical channel rather than building a second lexical engine.
- Assumptions we're making
  - Current and near-future memory-store sizes stay well under the corpus scan cap (5,000 rows); beyond that, semantic degrades to lexical-only by design rather than requiring an ANN index.
  - A single pinned quantized model, chosen and frozen by the model-selection gate below, is sufficient; per-project model choice is not needed.

## Model Selection Gate (evidence)

Two candidate local embedding models were evaluated head-to-head against the expanded-100 benchmark before implementation proceeded, using the paraphrase nDCG@5 and recall@5 improvement over lexical-only FTS as the pass/fail gate:

| Model | Paraphrase nDCG@5 delta | Paraphrase recall@5 delta | Gate result |
|---|---|---|---|
| `Xenova/all-MiniLM-L6-v2` (q8, 384-dim) | +15.41% | +11.76% | **Pass** — selected |
| BGE (small) | +8.75% | +5.88% | **Fail** — below the required improvement threshold |

MiniLM was selected because it cleared the paraphrase-improvement gate with margin and BGE did not; runtime footprint was a secondary tie-breaker (MiniLM's pinned q8 model is a 23 MB download vs. a larger BGE checkpoint). This decision is frozen: non-goals above explicitly exclude configurable models, so re-litigating the model choice requires a new requirements pass, not a config change.

## Questions & Open Items

**What do we still need to clarify?**

- None outstanding. The corpus-size ceiling (5,000 rows), fusion constant (RRF k=60), and model pin are treated as accepted defaults per the non-goals above; revisiting any of them is a new requirement, not an open item on this feature.
