---
phase: planning
title: Agent Registry Wrapper Transfer Plan
description: TDD and delivery tasks for wrapper-to-child identity reconciliation
---

# Agent Registry Wrapper Transfer Plan

## Tasks

- [x] Reproduce the live Gemini wrapper/child unique-name collision.
- [x] Add a failing registry test for direct wrapper-to-child transfer.
- [x] Implement minimal same-type batch identity transfer.
- [x] Add a failing test for transfer over an existing child fallback.
- [x] Preserve managed metadata and current child session data.
- [x] Keep duplicate names introduced within one batch as strict constraint failures.
- [x] Prove the regressions fail without the production fix and pass with it restored.
- [x] Run focused tests, full agent-manager tests, CLI tests, lint, typecheck, build, and a local CLI smoke test.
- [x] Prepare a validated, review-ready branch for commit and publication.

## Risks

- An overly broad transfer could hide unrelated name collisions. Mitigation: restrict transfer to batch writes and same-type owners.
- Replacing a cached child row could lose wrapper metadata. Mitigation: merge from the wrapper owner and replace both identities atomically.
