---
phase: planning
title: Session Reconciliation Implementation Plan
description: Ordered implementation and verification work
---

# Session Reconciliation Implementation Plan

- [x] Rebase PR #205 onto current `origin/main`.
- [x] Add red migration, reconcile, sandbox, atomicity, liveness, kill, and
  display regressions.
- [x] Add migration 005 and readonly schema-version enforcement.
- [x] Implement one-transaction session reconciliation and reversible PID reuse.
- [x] Integrate adapter success/error semantics into `listAgents`.
- [x] Remove interactive liveness probes and guard pinning with soft-delete state.
- [x] Support explicit hard deletion of live and soft-deleted agents.
- [x] Reconcile lifecycle documentation with the final design.
- [x] Run complete build, test, lint, and e2e gates.
- [x] Complete final review and logical commits; prepare force-push-with-lease and PR update.

Current risk focus: additive-schema PID tombstones, global name uniqueness across
soft-deleted history, and transaction rollback under constraint failure.
