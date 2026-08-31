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

## Gates

- [x] Targeted package regression tests: 3 passed.
- [x] Build all 6 projects: `npm run build`.
- [x] Full tests: `npm test` (6 projects; 2,076 tests passed after removing two retry-specific tests).
- [x] Lint: `npm run lint` (exit 0; four pre-existing warnings outside changed files).
- [x] End-to-end: `npm run test:e2e` (41 passed).

Temporary SQLite files under the OS temp directory are isolated per test and removed after each run.

Targeted regression coverage verifies concurrent fresh-file opens plus already-WAL and readonly mode-set suppression.

The earlier full memory coverage run reported 95.34% statement and 88.46% branch coverage for `connection.ts`. Its command exited 1 because the package-wide branch result was 67.54%, below the existing 75% global threshold.
