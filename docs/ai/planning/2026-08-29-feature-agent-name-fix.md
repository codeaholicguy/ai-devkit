---
phase: planning
title: Session Reconciliation Implementation Plan
description: Ordered implementation and verification work
---

# Session Reconciliation Implementation Plan

- [x] Rebase PR #205 onto current `origin/main`.
- [x] Rewrite regressions for hard deletion and unbound identity adoption.
- [x] Keep migration 005 limited to the session identity index.
- [x] Implement one-immediate-transaction reconciliation.
- [x] Preserve successful/error adapter semantics and remove liveness probes.
- [x] Retain explicit-kill registry fallback for adapter-error rows.
- [x] Update lifecycle documentation to the accepted destructive semantics.
- [x] Run complete build, test, lint, and e2e gates.
- [x] Complete final review, logical commits, force-push-with-lease, and PR update.

Risk focus: atomic PID displacement, unbound identity adoption, and destructive
observer-relative empty results.
