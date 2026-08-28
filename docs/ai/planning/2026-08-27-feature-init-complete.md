---
phase: planning
title: Complete Project Initialization Plan
description: TDD task plan for shared project application
---

# Complete Project Initialization Plan

## Milestone 1: Shared contracts

- [x] Define item results and incomplete exit policy with focused tests.
- [x] Refactor environment, phase, skill, and MCP work into one application service used by install.
- [x] Add phase match/preserve/overwrite policy for interactive and CI paths.

## Milestone 2: Complete init and MCP hardening

- [x] Persist normalized desired skills and delegate init application once.
- [x] Fail malformed MCP parsing without writes.
- [x] Deduplicate shared physical MCP targets.
- [x] Update truthful copy and stale environment help.

## Milestone 3: Integration and closure

- [x] Implement the testing document scenarios, using real filesystems where specified.
- [x] Reconcile lifecycle docs and feature lint.
- [x] Run build, full tests, and lint; perform design-alignment review.
- [ ] Create logical conventional commits, rebase, push, and open the PR.

## Dependencies and Risks

Mock registry/network and prompt boundaries only. Existing install tests encode phase replacement and will change. A clean bootstrap exposed a base Zod `PropertyKey[]` compile mismatch; resolve minimally if still required. Task tracing is unavailable in CLI 0.55.0 (`unknown command 'task'`), so progress stays here.
