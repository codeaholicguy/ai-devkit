---
phase: requirements
title: Agent Console Incremental Conversation Tailing
description: Keep console conversation previews responsive by reading only appended session data when formats allow
---

# Requirements & Problem Understanding

## Problem Statement

`useAgentConversation` currently calls synchronous adapter parsers whenever a selected session file changes. A measured 86,682,730-byte (82.7 MiB) Codex JSONL session requires hundreds of milliseconds for one full reread and parse, blocking Ink input and rendering on every poll that observes a write.

## Goals

- Add one asynchronous conversation-tail API used by the console preview.
- Keep the newest 20-message default and adapter-specific conversation semantics.
- For append-friendly JSONL, cache file identity, byte offset, incomplete record bytes, parser state, and recent messages so later polls read only appended bytes.
- Handle unchanged files, append, partial final lines, malformed complete records, truncation, replacement/rotation, missing files, and bounded cache eviction deterministically.
- Preserve Codex response-item/event-message mirrored-message deduplication across incremental reads.
- Let adapters provide more efficient storage-native implementations, including a limited OpenCode SQL query.
- Keep monolithic formats and unsupported incremental formats off the Ink event loop through a safe asynchronous fallback.
- Ignore stale asynchronous results after selection changes or overlapping polls.
- Preserve polling when filesystem watching is unavailable or unreliable.

## Constraints and Acceptance Criteria

- Existing synchronous `getConversation()` behavior and callers remain compatible.
- The async API returns read diagnostics suitable for deterministic tests and benchmarks (`bytesRead`, `recordsProcessed`, cache/reset information); tests must not depend on wall-clock thresholds.
- A completed malformed JSONL record is skipped and counted; an incomplete final record is buffered without being reported as malformed.
- File identity changes or size regression reset parser state and rebuild from byte zero.
- Cache capacity is bounded and least-recently-used entries are evicted.
- Initial parsing may read the complete file; an append-only refresh must read only the appended byte range.
- Console state is updated only by the newest request for the currently selected agent.
- Focused and full agent-manager and CLI tests, lint, builds, and a repeatable before/after benchmark must pass before publication.

## Scope Decision

The shared async API, reusable JSONL tail cache, Codex integration, OpenCode limited query, console integration, and safe fallback are required now. Additional adapters may adopt the reusable incremental reducer in follow-up changes if preserving their exact stateful semantics would make this change unsafe; they must still work through the shared async API rather than through a second UI architecture.

## Non-goals

- Changing visible conversation content, verbose rendering, or non-console command output.
- Replacing adapter detection/session discovery.
- Merging the resulting pull request.
