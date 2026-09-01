---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones

**What are the major checkpoints?**

- [x] Milestone 1: Model selection gate run and decided (MiniLM passed, BGE rejected — see requirements doc)
- [x] Milestone 2: Storage, embedder runtime, and retrieval primitives implemented and unit-tested
- [x] Milestone 3: Hybrid search, maintenance commands, and CLI/MCP wiring implemented and integration-tested
- [x] Milestone 4: Full-suite gates (build, test, lint, e2e) green and benchmark evidence captured
- [x] Milestone 5: Post-merge-readiness simplification pass — remove speculative config surface and dead code before merge

## Task Breakdown

**What specific work needs to be done?**

### Phase 1: Foundation
- [x] Task 1.1: Benchmark MiniLM vs. BGE against the expanded-100 gate; select MiniLM (`c5c750c`, `packages/memory/src/services/model.ts`)
- [x] Task 1.2: Add additive migration `002_semantic_embeddings.sql` (nullable `embedding`/`embedding_version`, index) with a test asserting existing rows are untouched
- [x] Task 1.3: Add `services/config.ts` (`readSemanticConfig`) defaulting to disabled on any missing/malformed config

### Phase 2: Core Retrieval
- [x] Task 2.1: Add `services/semantic.ts` primitives — embedding text builder, BLOB (de)serialization, cosine similarity, deterministic RRF fusion — with unit tests for determinism and tie-breaking
- [x] Task 2.2: Add `services/model.ts` (pinned identity/checksums, atomic checksummed download) and `services/embedder.ts` (tokenizer + ONNX session, mean-pool + normalize) with unit tests for checksum enforcement and pooling correctness
- [x] Task 2.3: Add `handlers/semantic-search.ts` (`searchKnowledgeHybrid`) with offline/corrupt/stale/oversized-corpus degradation tests

### Phase 3: Write Path & Maintenance
- [x] Task 3.1: Extend `handlers/store.ts`/`handlers/update.ts` to persist an optional embedding and invalidate it on content/tag/title changes (retain it on scope-only updates)
- [x] Task 3.2: Add `handlers/semantic-maintenance.ts` — semantic-aware store/update, `getSemanticStatus`, `downloadSemanticModel`, resumable `reembedKnowledge`
- [x] Task 3.3: Wire `memory.semantic` config through `server.ts` (MCP) and `api.ts`/`commands/memory.ts` (CLI), preserving default (disabled) behavior exactly

### Phase 4: Validation
- [x] Task 4.1: Run the expanded-100 benchmark through the built CLI and record hit@1/3/5, zero-result rate, and timings
- [x] Task 4.2: Run the 1,000-row warm latency gate against the search SLA (<50 ms p95)
- [x] Task 4.3: Run six-project build, full test suite, lint, and e2e across the monorepo
- [x] Task 4.4: `await`-harden semantic writes and reuse embedder sessions across calls (`7686a7d`, `079bfce`)

### Phase 5: Pre-merge simplification (this pass)
- [x] Task 5.1: Audit the diff for speculative config surface, unused options, and dead guard/error paths against the `simplify-implementation` discipline
- [x] Task 5.2: Collapse `loadLocalEmbedder`'s unused `modelsRoot`/`download` options and the dead offline-inspect branch; remove the never-invoked `LocalEmbedder.dispose()`; replace the never-narrowed `SemanticModelUnavailableError` with a plain `Error`
- [x] Task 5.3: Close the CLI test gap on the semantic-enabled `memory update` path (previously an unused mock import, flagged by lint)
- [x] Task 5.4: Rebuild the five lifecycle phase docs (this document and its siblings) against the simplified, shipped state, replacing the single ad hoc `docs/ai/2026-09-01-feature-memory-semantic.md` note

### Phase 6: User review correction (this pass)
- [x] Task 6.1: Reinstate `GlobalDevKitConfig.memory.semantic` — the initial pass wrongly treated it as dead code; it was unwired, not unwanted.
- [x] Task 6.2: Wire it at the single resolution site (`ConfigManager#getMemorySemanticEnabled`) with project > global > default(false) precedence, so semantic search can be enabled once globally instead of per project.
- [x] Task 6.3: Add tests for all three precedence cases (project overrides global, project unset inherits global, both unset defaults to false).
- [x] Task 6.4: Record the precedence decision and its rationale in the design doc; correct the implementation/testing docs and the simplification record to reflect the reversal.

## Dependencies

**What needs to happen in what order?**

- Task dependencies and blockers
  - Model selection (1.1) had to complete before any embedder/runtime code (2.2) was written, since the pinned checksums and dimension are model-specific.
  - Migration (1.2) had to land before the write path (3.1) could persist embeddings.
  - Storage/embedder primitives (2.1-2.2) had to exist before hybrid search (2.3) and maintenance (3.2) could consume them.
  - The simplification pass (5.x) was deliberately sequenced *after* functional completion (4.x) so eval-passing behavior (fusion, degradation, migration safety) was never at risk while removing speculative surface.
- External dependencies
  - One-time HTTPS fetch of the pinned model files from Hugging Face (`huggingface.co`) — required only for `memory semantic download` or the first semantic operation, not for build/lint/most tests.
- Team/resource dependencies
  - None beyond the implementer; this is a self-contained package-level feature.

## Timeline & Estimates

**When will things be done?**

Delivered in a single feature branch (`feature-memory-semantic`) across five commits before this simplification pass (`c5c750c` storage primitives, `7f529bc` hybrid search wiring, `7686a7d` await/fallback hardening, `079bfce` session reuse) plus the three simplification commits in this pass. No further phases are planned unless testing or review surfaces a gap.

## Risks & Mitigation

**What could go wrong?**

- Technical risks
  - A future corpus could exceed the 5,000-row scan cap in normal use, silently falling back to lexical-only. Mitigated by surfacing `corpus-too-large` explicitly in the response and `--explain` output rather than degrading silently.
  - The pinned model could become unavailable at its Hugging Face revision URL. Mitigated by checksum verification (fails loudly, not silently, on a bad download) and by the fact the runtime itself never redownloads once cached.
- Resource risks
  - None currently — the feature is self-contained within `@ai-devkit/memory` and `@ai-devkit/cli`.
- Dependency risks
  - `onnxruntime-web`/`@huggingface/tokenizers` version drift could change inference output. Mitigated by pinning exact versions in `package.json` and verifying ONNX output against Transformers.js output during model selection.
- Mitigation strategies already in place
  - Every semantic failure mode (missing model, download failure, corrupt embedding, dimension mismatch, oversized corpus) has a dedicated integration test asserting lexical fallback rather than an error.

## Resources Needed

**What do we need to succeed?**

- Tools and services: existing TypeScript/Vitest workspace tooling; no new CI infrastructure required.
- Documentation/knowledge: this planning doc plus its requirements/design/implementation/testing siblings are now the source of truth, replacing the prior single ad hoc note.

## Progress Summary

All functional milestones (1-4) were complete and gate-evidenced before this pass began. This pass (Milestone 5) audited the shipped diff against the repository's simplification discipline, removed three pieces of speculative/dead surface (unused embedder options and an unreachable degradation branch, an unused error subclass, and an unused lifecycle method), closed one CLI test gap that lint had flagged, and rebuilt the lifecycle documentation set to match the phase-by-phase discipline the docs were missing. A fourth candidate — `GlobalDevKitConfig.memory.semantic` — was initially removed as dead code, then reinstated on user review (Milestone 6): the field was unwired, not unwanted, and now resolves with project > global > default(false) precedence at the one call site every semantic-aware path already goes through. No eval-passing behavior (RRF fusion, degradation paths, migration safety, or the MiniLM model/thresholds) was changed.

## Next Focus

- Update the pull request description to link these five phase docs and summarize lifecycle conformance.
- Re-run the full gate suite (build, test, lint, e2e) after the simplification commits and confirm green before requesting review.
- No open implementation tasks remain; proceed to `dev-review`.
