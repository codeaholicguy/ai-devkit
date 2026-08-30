---
phase: planning
title: Concurrency-safe WAL setup plan
description: Small cross-package SQLite bootstrap fix
---

# Plan

- [x] Add memory regression tests for concurrent opens, conditional WAL, readonly opens, and one-shot busy retry.
- [x] Apply the same timeout, conditional WAL, and bounded retry to memory, agent-manager, and task-manager.
- [x] Run targeted tests and prove the regression test fails without the fix.
- [x] Run the six-project build, full test suite, lint, and e2e gates.
- [ ] Review, commit logically, rebase on `origin/main`, push, and open the PR.

Risk is limited to synchronous startup configuration. The retry is bounded to one 50 ms backoff and only handles SQLite's busy code.

Implementation scope remained unchanged. Full repository gates and publication are the remaining tasks.
