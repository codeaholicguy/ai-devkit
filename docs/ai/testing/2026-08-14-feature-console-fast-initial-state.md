---
phase: testing
title: Agent Console Fast Initial State Testing
description: Deterministic validation matrix for cached first-frame behavior
---

# Agent Console Fast Initial State Testing

## Automated Matrix

- [x] Manager snapshot preserves registered names and metadata.
- [x] Manager snapshot excludes dead PIDs and types without registered adapters.
- [x] Manager snapshot does not call adapter discovery.
- [x] Cached agents render while the live-list promise remains deliberately unresolved.
- [x] Live results replace cached rows atomically and remove omitted stale rows.
- [x] Live refresh rejection retains cached rows and exposes the error.
- [x] No-cache startup preserves the existing empty loading state and reconciles to live empty.
- [x] Cached rows and footer explicitly say cached/refreshing or cached/refresh failed.
- [x] Cached preview metadata never presents registry start time as live activity.
- [x] Full agent-manager and CLI suites (504 and 966 tests respectively).
- [x] Agent-manager and CLI lint/build.
- [x] Repository docs lint.

Tests coordinate async work through controlled promises and render-state observers. They do not use sleeps, elapsed-time assertions, or freshness thresholds.
