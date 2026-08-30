---
phase: testing
title: Concurrency-safe WAL setup testing
description: Regression and repository gate coverage
---

# Testing

## Regression coverage

- [x] Concurrent connections to a fresh shared memory database complete without `SQLITE_BUSY`.
- [x] An already-WAL database does not execute `journal_mode = WAL` again.
- [x] A readonly already-WAL connection does not execute a mode-set.
- [x] A first `SQLITE_BUSY` during configuration waits and retries the full sequence once.
- [x] A non-busy error is not retried.

## Gates

- [x] Targeted package regression tests: 5 passed.
- [x] Build all 6 projects: `npm run build`.
- [x] Full tests: `npm test` (6 projects; 2,078 tests passed).
- [x] Lint: `npm run lint` (exit 0; four pre-existing warnings outside changed files).
- [x] End-to-end: `npm run test:e2e` (41 passed).

Temporary SQLite files under the OS temp directory are isolated per test and removed after each run.

Targeted TDD evidence: fixed code passed 5/5; temporarily restoring the old memory configuration failed the three new behavioral assertions; restoring the fix passed 5/5 again.

The full memory coverage run reports 95.34% statement and 88.46% branch coverage for `connection.ts`. Its command exits 1 because the package-wide branch result is 67.54%, below the existing 75% global threshold; all 115 tests in that run pass.
