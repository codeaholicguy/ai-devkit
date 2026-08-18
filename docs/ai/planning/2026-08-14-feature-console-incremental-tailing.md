---
phase: planning
title: Agent Console Incremental Conversation Tailing
description: Ordered implementation plan for async and incremental conversation preview reads
---

# Implementation Plan

## 1. Baseline and contracts

- [x] Confirm clean feature worktree and measure the existing Codex full parse.
- [x] Review adapter and hook semantics and choose the shared API architecture.
- [x] Add public tail result/options/stats types and manager delegation.

## 2. Deterministic red tests

- [x] Add reusable JSONL cache tests for initial bytes, append-only bytes, unchanged hits, partial records, malformed records, truncate, replacement, and LRU eviction.
- [x] Add Codex tests for incremental append and mirrored-message deduplication.
- [x] Add OpenCode limited-query coverage.
- [x] Add hook tests for awaited results, stale selection rejection, 20-message slicing, unchanged cache behavior, and polling fallback.
- [x] Add synthetic large-fixture benchmark/tests that assert processed bytes/records rather than timing.

## 3. Implementation

- [x] Implement the reusable async JSONL cache and Codex reducer.
- [x] Implement manager async delegation and safe monolithic fallback.
- [x] Implement OpenCode storage-native tail query.
- [x] Convert `useAgentConversation` to awaited requests with stale-result protection.
- [x] Document optimized adapters and fallback follow-ups.

## 4. Validation and publication

- [x] Run focused and full agent-manager and CLI tests.
- [x] Run package/repository lint and builds.
- [x] Run repeatable full-read versus appended-read benchmark.
- [x] Review design alignment and final diffs.
- [ ] Commit conventionally, rebase on `origin/main`, push `feature-console-incremental-tailing`, and open a PR targeting `main` without merging.
