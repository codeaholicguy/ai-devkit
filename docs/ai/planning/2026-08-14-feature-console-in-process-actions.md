---
phase: planning
title: Console In-Process Actions Plan
description: TDD task queue for shared console action services
---

# Console In-Process Actions Plan

## Task Queue

- [x] Add red tests for direct service dispatch for all seven console actions.
- [x] Add red deterministic tests for immediate pending notification and duplicate suppression.
- [x] Add red tests for successful results, service errors, and retry after settlement.
- [x] Extract agent action services and convert start/open/send/kill/rename Commander handlers to thin wrappers.
- [x] Extract channel start/stop action services and convert Commander handlers to thin wrappers.
- [x] Replace the console subprocess runner with direct in-process dispatch and injected defaults.
- [x] Wire immediate `Sending`, `Opening`, and `Stopping channel` feedback and pending guards into console flows.
- [x] Refactor after green and update implementation/testing documents.
- [x] Run focused tests, full CLI tests, CLI lint, CLI build, and feature-doc lint.
- [x] Review diff, commit conventionally, rebase on `origin/main`, revalidate, push, and open a PR to `main`.

## Scope Decision

All seven actions share the same dispatch/result boundary and are included. Command-only group, print, stdin, wait, and foreground-channel modes remain in Commander orchestration, using existing lower-level services, because the console does not invoke them.

Implementation refined this boundary by moving group, print, wait, and foreground-channel orchestration into the application services as well. Commander retains only parsing/input acquisition, output/exit adaptation, and registration.
