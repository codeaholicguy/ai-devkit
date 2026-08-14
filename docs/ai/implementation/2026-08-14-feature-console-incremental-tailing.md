---
phase: implementation
title: Agent Console Incremental Conversation Tailing
description: Implementation record for async preview reads and incremental JSONL caching
---

# Implementation Record

## Status

Implemented and validated; publication remains.

## Baseline

- Fixture: Codex JSONL, 86,682,730 bytes (82.7 MiB), 468 visible messages.
- Existing synchronous parser, five warm runs: 250.5, 261.8, 292.0, 304.4, 307.2 ms; median 292.0 ms on 2026-08-14.
- User-provided measured hotspot: 336.6 ms for the same size class.

## Intended Changed Surfaces

- `packages/agent-manager`: shared tail types/cache, manager API, Codex incremental reducer, OpenCode limited reader, fallback, exports, and tests.
- `packages/cli`: awaited hook integration, stale request rejection, cache/polling behavior, and tests.

## Decisions

- Preserve the synchronous adapter contract for existing callers.
- Give the console one manager-level async API; optimized and fallback paths remain hidden below it.
- Measure bytes and complete records processed in tests and benchmark output.

## Implemented Surfaces

- `AgentAdapter` exports async tail options/result/stats and an optional optimized method; `AgentManager.getConversationTail()` is the single UI entry point.
- `JsonlConversationTailCache` performs serialized positional reads and maintains identity, byte offset, incomplete bytes, reducer state, deterministic diagnostics, and a 50-entry LRU.
- `CodexAdapter` uses the cache and retains response-item mirror keys so mirrored event records remain deduplicated even when the pair straddles polls.
- `OpenCodeAdapter` filters displayable parts, orders newest-first, applies SQL `LIMIT ?`, then reverses mapped results into chronological order.
- `GeminiCliAdapter` reads and parses monolithic JSON in a worker thread and caches unchanged results.
- `useAgentConversation` awaits the manager API, prevents overlapping reads, invalidates stale selection tokens, keeps immediate display caching, preserves the 20-message default, and retains 3-second polling.
- A checked-in `benchmark:conversation-tail` command copies the supplied fixture to a temporary directory before appending, leaving the source untouched.

## Edge Cases

- Partial final JSONL records remain buffered until newline completion.
- Malformed complete lines are counted and skipped; later records continue.
- Inode changes, size regression, and same-size in-place rewrites reset state.
- Missing files evict state and return a missing reset result.
- Per-key reads serialize to protect offsets from overlapping requests.
- LRU eviction drops complete parser state and causes a correct rebuild on return.

## Adapter Support and Follow-ups

- Optimized now: Codex (incremental JSONL), OpenCode (limited SQLite), Gemini (off-thread monolithic JSON).
- Compatibility fallback now: Claude, Copilot, Grok, Pi. These preserve their existing `getConversation()` semantics and unchanged-file caching through the shared async manager API, but a changed file still receives a deferred full parse.
- Follow-up: migrate Claude, Copilot, Grok, and Pi to `JsonlConversationTailCache` with adapter-specific reducers and parity tests. No second hook or adapter API is needed.

## Benchmark

82.7 MiB Codex fixture (86,682,730 bytes, 11,747 complete records, 468 visible legacy messages):

- Legacy full parse: five runs 300.5, 350.9, 276.2, 313.1, 276.4 ms; median 300.5 ms. User-reported prior hotspot: 336.6 ms.
- Incremental initial load: 241.4 ms, 86,682,730 bytes, 11,747 records.
- One appended record: 0.246 ms, 130 bytes, 1 record.
- Unchanged refresh: 0.029 ms, 0 bytes, 0 records, cache hit.

## Validation

- Focused new/changed agent-manager tests: 5 files, 104 tests passed.
- Full agent-manager: 27 files, 526 tests passed sequentially; the default fixed 5-second print-agent integration timeout was exceeded during loaded parallel runs, so the unrelated process-inspection integration was validated separately with a 30-second allowance.
- Full CLI after rebasing onto current `main`: 81 files, 970 tests passed.
- Agent-manager lint: exit 0. CLI lint: exit 0 with five pre-existing unused-catch warnings outside touched files.
- Monorepo build: all 6 projects passed.
- Feature lint and `git diff --check`: exit 0.
- Regression proof: removing same-size rewrite detection made its deterministic test fail with stale content; restoring it passed.
