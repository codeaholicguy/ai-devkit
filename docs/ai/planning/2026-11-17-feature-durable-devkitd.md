---
phase: planning
title: Durable agents managed by devkitd
---

# Durable devkitd implementation plan

Requirements/design approved; execute in order with red/green evidence per slice. Task tracing unavailable; this checklist is authoritative.

## Milestones
- [x] P1: Durable schema/store and transitions (R1,R5,R8). Add failing state/concurrency/token/session/cwd tests; implement atomic store. Dependencies: none.
- [x] P2: Rust provider protocol extraction and durable start profiles (R2,R5). Shared parity fixtures for TS/Rust, malformed/oversized/incomplete streams, first/resume argv. Depends P1 types.
- [x] P3: Daemon RPC/supervision/reconciliation/stop (R1,R2,R3,R8). Socket tests with stub processes, actual exits, disconnect, restart adoption and PID reuse. Depends P1/P2.
- [x] P4: One-time import and persistent fence (R6,R7). Snapshot/import/retry/conflict/active state tests. Depends P1; wire capability only after migration readiness.
- [x] P5: Typed daemon client + CLI durable routing and sessions (R4,R7). Pre-capability fallback tests, post-mutation error tests, preserved CLI output and session mapping. Depends P3/P4.
- [x] P6: Root E2E, coverage review, implementation alignment and simplify analysis (R1-R8). Build dependencies; execute all required checks and disposable smoke. Depends P1-P5.
- [ ] P7: Final code/security review, resolve findings, rebase origin/main, rerun affected checks, commit/push and PR. No commits until prior gates pass. Depends P6.

## Risks and Sequencing
Do not reconcile own children before waiters commit. Adoption cannot recover exit codes; report interrupted honestly. Import must not become repeated dual-write. Never retry a possibly executed mutation locally. Keep blocking process/DB work off the socket loop and bound memory. No new architecture gates unless a material deviation emerges.

## Progress
P1-P6 implemented and validated. Review found and resolved recovery, parity and wire-contract regressions with red/green tests. No material architecture change or pending ruling. P7 publication remains: final verification, explicit staging/commit, rebase origin/main, push and PR.
