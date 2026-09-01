---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup

**How do we get started?**

- Work in `packages/memory` (retrieval/storage runtime) and `packages/cli` (`memory` command wiring), both TypeScript + Vitest.
- New direct dependencies of `@ai-devkit/memory`: `onnxruntime-web@1.22.0`, `@huggingface/tokenizers@0.1.3`.
- Run focused tests:
  - `npm --workspace @ai-devkit/memory test -- tests/unit/semantic.test.ts tests/unit/model.test.ts tests/unit/config.test.ts`
  - `npm --workspace @ai-devkit/memory test -- tests/integration/semantic-search.test.ts tests/integration/semantic-storage.test.ts`
  - `npm --workspace ai-devkit test -- src/__tests__/commands/memory.test.ts src/__tests__/lib/Config.test.ts`

## Code Structure

**How is the code organized?**

- `packages/memory/src/services/config.ts` — `readSemanticConfig(directory?)`, reads `.ai-devkit.json`.
- `packages/memory/src/services/model.ts` — `MODEL_ID`/`MODEL_REVISION`/`MODEL_DIMENSION`/`MODEL_VERSION`/`MODEL_FILES`, `getModelDirectory`, `inspectModelFiles`, `ensureModelFiles`, `normalizeEmbedding`.
- `packages/memory/src/services/embedder.ts` — `LocalEmbedder` (`embed`, `embedMany`), `getDefaultLocalEmbedder` (memoized per process), `loadLocalEmbedder`, `meanPoolAndNormalize`.
- `packages/memory/src/services/semantic.ts` — `buildEmbeddingText`, `serializeEmbedding`/`deserializeEmbedding`, `cosineSimilarity`, `fuseSearchResults`, `EMBEDDING_DIMENSION`, `RRF_K`.
- `packages/memory/src/handlers/semantic-search.ts` — `searchKnowledgeHybrid`.
- `packages/memory/src/handlers/semantic-maintenance.ts` — `getSemanticStatus`, `downloadSemanticModel`, `storeKnowledgeSemantic`, `updateKnowledgeSemantic`, `reembedKnowledge`.
- `packages/memory/src/handlers/store.ts` / `update.ts` — accept an optional `{ value, version }` embedding argument; `update.ts` nulls both columns whenever title/content/tags change and no replacement embedding is supplied.
- `packages/memory/src/database/migrations/002_semantic_embeddings.sql` — additive columns + index.
- `packages/memory/src/server.ts` — reads `readSemanticConfig().enabled` once at server construction and routes each MCP tool call to the semantic or plain handler.
- `packages/memory/src/api.ts` — exports `*Async` command wrappers (`memorySearchCommandAsync`, `memoryStoreCommandAsync`, `memoryUpdateCommandAsync`) plus `memorySemanticStatusCommand`, `memoryDownloadSemanticCommand`, `memoryReembedCommand`.
- `packages/cli/src/lib/Config.ts` — `getMemorySemanticEnabled()` reads `memory.semantic === true` from the project `.ai-devkit.json`.
- `packages/cli/src/commands/memory.ts` — `registerMemoryCommand` picks the async/semantic-aware command when `getMemorySemanticEnabled()` resolves `true`; adds the `memory semantic status|download` and `memory reembed [--force]` subcommands and `--explain` on `memory search`.

## Implementation Notes

**Key technical details to remember:**

### Core Features
- Fusion: `score = 1/(RRF_K + lexicalRank) + 1/(RRF_K + semanticRank)` with `RRF_K = 60`; ties break on lexical presence, then lexical rank, then semantic rank, then id — fully deterministic (`fuseSearchResults`, `packages/memory/src/services/semantic.ts:62`).
- Degradation is per-call, not a single global switch: `searchKnowledgeHybrid` catches any embedder/model error and returns `retrievalMode: 'lexical'` with a `semantic.status`/`reason` explaining why, rather than throwing.
- Corpus scan cap: `MAX_SEMANTIC_CORPUS = 5_000` — above that count of eligible (`embedding_version` current, non-null) rows, the handler returns `corpus-too-large` and never touches the embedder for that call.
- Embedding invalidation: `updateKnowledge` nulls `embedding`/`embedding_version` whenever `title`, `content`, or `tags` is provided in the update, unless a freshly computed replacement embedding is passed in by `updateKnowledgeSemantic`. A scope-only update leaves the existing embedding untouched.
- The embedder session (tokenizer + ONNX `InferenceSession`) is created once per process and memoized (`getDefaultLocalEmbedder`) so repeated CLI/MCP calls in one process reuse it instead of re-loading ~23 MB of model weights per call.

### Patterns & Best Practices
- Config is read once at the process/command boundary (`server.ts`, `commands/memory.ts`), not threaded as a parameter through every handler — the flag is process-lifetime, not per-call state.
- Every handler that can use semantic search/write takes an optional `{ embedder? }` override; this is the only DI seam, used exclusively by tests to inject deterministic fixed-vector embedders instead of loading the real ONNX runtime.
- Model files are downloaded to a per-process temp path (`${destination}.tmp-${process.pid}`) and atomically renamed into place, so a crashed/interrupted download can never leave a partially-written model file that would pass a later existence check but fail inference.

### Simplification pass (post-functional-completion)
Applied after all eval gates and functional tests were already green, so none of it touches ranking, degradation, or migration behavior:
- Removed `GlobalDevKitConfig.memory.semantic` — added by mistake alongside the per-project field; nothing in `GlobalConfig.ts` or anywhere else ever read it.
- Collapsed `loadLocalEmbedder()` from a `{ modelsRoot?, download? }`-configurable function to a zero-argument one. Its only real caller (`getDefaultLocalEmbedder`) always passed `download: true` and never passed `modelsRoot`; the `download: false` branch (inspect-only, throw if not ready) was unreachable in shipped code, and `storeKnowledgeSemantic`/`updateKnowledgeSemantic`/`reembedKnowledge` all threaded a `modelsRoot` option that no caller (production or test) ever set.
- Removed `LocalEmbedder.dispose()` — implemented (`session.release()`) but never invoked anywhere; the embedder is process-lifetime by design (CLI processes are short-lived and exit; the MCP server holds one memoized session for its life), so there was no call site that could ever exercise cleanup.
- Replaced `SemanticModelUnavailableError` with a plain `Error` (still carrying `cause`) — the subclass was thrown but never checked with `instanceof` anywhere; every catch site already falls back to `error.message`/`String(error)` generically.
- `getSemanticStatus`/`downloadSemanticModel` kept their `{ modelsRoot? }` option: unlike the removed cases, it is genuinely exercised by a test (`reports model and embedding readiness without loading the runtime`) to assert the "model not cached" status without touching the real `~/.ai-devkit/models` directory or requiring a mocked filesystem.
- Added a CLI test for the semantic-enabled `memory update` path, which had an unused mock import (`memoryUpdateCommandAsync`, flagged by `eslint no-unused-vars`) because the corresponding behavior — symmetric to the already-tested store/search paths — had no test.

## Integration Points

**How do pieces connect?**

- MCP server (`server.ts`): `createServer()` reads the config flag once, then each tool handler (`memory_storeKnowledge`, `memory_updateKnowledge`, `memory_searchKnowledge`) branches to the semantic-aware or plain handler based on that flag.
- CLI (`commands/memory.ts`): each `memory store|update|search` action calls `resolveSemanticEnabled()` (via `ConfigManager`) per invocation and picks the async or sync command function; `memory semantic status|download` and `memory reembed` always go through the async semantic-maintenance API regardless of the flag (they are explicit operator actions).
- `api.ts` is the seam CLI commands go through; it owns `getDatabase`/`closeDatabase` lifecycle per command so each CLI invocation opens and closes its own database handle.

## Error Handling

**How do we handle failures?**

- Semantic search failure of any kind → lexical-only result set with `semantic.status: 'unavailable'` and a `reason` string; never an error response, never a thrown exception from `searchKnowledgeHybrid`.
- Semantic write failure (embedder unavailable) → `storeKnowledgeSemantic`/`updateKnowledgeSemantic` fall back to the plain (non-semantic) `storeKnowledge`/`updateKnowledge` call, so the memory is still saved without an embedding rather than failing the write.
- Corrupt embedding row (wrong byte length) or dimension mismatch during a similarity comparison → that row is skipped from semantic candidates; lexical results for the same row remain unaffected.
- Model download checksum/size mismatch → throws loudly (does not silently accept a bad file); a `memory semantic download` invocation surfaces this as a command failure rather than caching a corrupt file.

## Performance Considerations

**How do we keep it fast?**

- Warm p95 search latency at 1,000 rows: 29.78 ms (budget: <50 ms); see the testing doc for the full benchmark record.
- The embedder session is memoized per process; only the very first semantic operation in a process pays tokenizer/ONNX load cost.
- The corpus scan cap keeps the cosine-similarity pass bounded regardless of memory-store growth, at the cost of falling back to lexical-only past the cap (explicit, reported, and out of scope to change per the requirements non-goals).

## Security Notes

**What security measures are in place?**

- Model files are fetched over HTTPS and verified against pinned SHA-256 checksums and exact byte sizes before being used or considered cached; a mismatch throws instead of using the file.
- Downloaded files are written to a per-process temp path and atomically renamed into place, avoiding a window where a partially-downloaded file could be read as "ready."
- No embedding content or query text ever leaves the local machine — inference runs entirely in-process via `onnxruntime-web`'s WASM backend.
