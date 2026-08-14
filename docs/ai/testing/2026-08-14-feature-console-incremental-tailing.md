---
phase: testing
title: Agent Console Incremental Conversation Tailing - Testing Strategy
description: Deterministic correctness, regression, and benchmark coverage for async incremental preview reads
---

# Testing Strategy

## TDD Coverage

- [x] Initial JSONL load reports exact fixture bytes and complete record count.
- [x] Unchanged load processes zero bytes and zero records.
- [x] Append load processes exactly appended bytes/records.
- [x] Partial final record is buffered and completed by a later append.
- [x] Malformed complete record is counted and skipped without poisoning later records.
- [x] Truncation and identity replacement rebuild state from byte zero, including same-size in-place rewrites.
- [x] LRU eviction forces a rebuild when the evicted path returns.
- [x] Synthetic large fixture proves append work is independent of prior file size using byte/record assertions.
- [x] Codex async output preserves legacy roles/content/order and mirrored-message deduplication, including mirrors split across reads.
- [x] OpenCode returns the newest requested displayable rows in chronological order using a limited query.
- [x] Gemini preserves monolithic adapter semantics while reading and parsing off the Ink event loop.
- [x] Hook ignores stale result/error completions after selection changes and keeps the newest 20 messages.
- [x] Hook serves unchanged cached data and continues interval polling when no watch event exists.

## Validation Commands

- Focused Vitest files during each red/green/refactor cycle.
- Full `packages/agent-manager` and `packages/cli` test suites.
- Package lint/typecheck/build plus repository lint/build.
- `npx ai-devkit@latest lint --feature console-incremental-tailing`.
- Repeatable benchmark against the 82.7 MiB Codex fixture, reporting full-load and append-refresh work/time.

## Evidence

- Focused agent-manager feature set: 5 files / 104 tests passed.
- Hook/cache test: 14 tests passed.
- Full agent-manager: 27 files / 526 tests passed sequentially with a 30-second allowance for the process-inspection integration.
- Full CLI: 79 files / 962 tests passed.
- Agent-manager and CLI lint exited 0; CLI reported five pre-existing warnings outside touched files.
- Six-project monorepo build and feature-doc lint exited 0.
- Benchmark append refresh processed exactly 130 bytes / 1 record versus 86,682,730 bytes / 11,747 records on initial load.
