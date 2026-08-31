---
phase: planning
title: Concurrency-safe WAL setup plan
description: Small cross-package SQLite bootstrap fix
---

# Plan

- [x] Add memory regression tests for concurrent opens, conditional WAL, and readonly opens.
- [x] Apply the same timeout and conditional WAL setup to memory, agent-manager, and task-manager.
- [x] Run targeted tests and prove the regression test fails without the fix.
- [x] Run the six-project build, full test suite, lint, and e2e gates.
- [x] Review, commit logically, rebase on `origin/main`, push, and open the PR.

Risk is limited to a rare simultaneous-fresh-database collision that may surface once and self-heal when the command is rerun.

Implementation scope remained unchanged. PR #206 contains the reviewed change.
