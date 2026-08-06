---
phase: planning
title: Slack Channel Connector Plan
description: Ordered strict-TDD plan for the local Slack Socket Mode connector
---

# Slack Channel Connector Plan

## Milestones

- [x] Milestone 1: Provider-neutral contracts and Slack-safe delivery foundation
- [x] Milestone 2: Secure Slack Socket Mode transport, pairing, and interaction support
- [x] Milestone 3: CLI/daemon integration, documentation, regression coverage, and release readiness

## Task Breakdown

### Phase 1: Contracts and rendering

- [x] **Task 1.1 — Discriminated channel configuration and provider capabilities.** Outcome: Slack and Telegram configs are type-safe and the CLI can consume generic send/interaction contracts. Dependencies: none. Evidence: config/contract unit tests and typecheck. Scenarios: configuration/adapter seam.
- [x] **Task 1.2 — Slack Markdown renderer and semantic chunker.** Outcome: safe independently valid chunks at or below 4,000 characters with code preservation and plain fallback. Dependency: 1.1. Evidence: renderer coverage. Scenarios: renderer/chunker matrix.
- [x] **Task 1.3 — Rate-limit-aware threaded delivery queue.** Outcome: bounded ordered per-conversation sends with parent/thread continuity and retry metadata. Dependencies: 1.1-1.2. Evidence: fake-timer Web API tests. Scenarios: delivery queue and burst limits.

### Phase 2: Transport, pairing, and questions

- [x] **Task 2.1 — Slack adapter on official SDKs.** Outcome: injectable Socket Mode/Web API clients, event normalization, prompt acknowledgment, filtering, idempotency, health, and lifecycle. Dependencies: Phase 1. Evidence: SDK-mocked adapter tests. Scenarios: adapter events/health.
- [x] **Task 2.2 — Explicit pairing and allowlist persistence.** Outcome: expiring single-use CSPRNG pairing with exact team/user/DM authorization and no first-speaker takeover. Dependency: 2.1. Evidence: pairing/security unit and integration tests. Scenarios: pairing/authorization.
- [x] **Task 2.3 — Provider-neutral structured questions.** Outcome: shared question parsing/state with Telegram compatibility and Slack Block Kit option/Skip actions. Dependencies: 1.1, 2.1-2.2. Evidence: interaction and terminal-key tests. Scenarios: questions and replays.

### Phase 3: CLI and product integration

- [x] **Task 3.1 — Slack setup and adapter factory.** Outcome: `channel connect slack`, official SDK identity validation, named provider resolution, and secret-safe config. Dependencies: Phase 2. Evidence: command/service tests. Scenarios: CLI setup.
- [x] **Task 3.2 — Generic bridge runner, status, and daemon lifecycle.** Outcome: Slack/Telegram runtime dispatch, generic authorization/output delivery, accurate bridge type, provider-neutral display, and unchanged Telegram behavior. Dependencies: 3.1. Evidence: runner/command/daemon integration tests. Scenarios: cross-component and regressions.
- [x] **Task 3.3 — User documentation and app manifest.** Outcome: installable manifest, setup/run/security/troubleshooting guide, scope explanation, and optional manual sandbox validation. Dependencies: 3.1-3.2. Evidence: docs lint and content review.
- [x] **Task 3.4 — Full verification and security remediation.** Outcome: coverage gaps closed, lint/typecheck/build/tests green, trust boundaries reviewed, docs finalized. Dependencies: all tasks. Evidence: fresh verification commands and final review.

## Dependencies and Sequencing

- Every production behavior follows red → green → refactor; each task begins with a targeted failing test.
- Phase 1 creates the stable API used by transport and CLI work.
- Pairing precedes accepting any agent input.
- Interaction handling depends on stable authorization and idempotency.
- CLI integration follows adapter behavior so command tests mock a real contract rather than inventing one.
- Phase 6 planning reconciliation occurs after every completed task.

## Risks & Mitigation

| Risk | Mitigation |
|---|---|
| Provider abstraction grows beyond MVP | Add only capabilities required by Telegram and Slack tests; keep Slack SDK types inside adapter modules. |
| Slack retry shapes differ across SDK versions | Test public SDK error fields and prefer SDK retry behavior where documented; keep injected sleeper/clients. |
| First-user takeover | Never auto-authorize; require expiring local pairing code and exact identity tuple. |
| Duplicate terminal input | Acknowledge promptly, mark stable IDs before dispatch, bound/persist enough state for bridge lifetime. |
| Long output hits rate limits | Serialize per conversation, thread chunks, honor retry delay, bound the queue. |
| Telegram regressions | Preserve defaults and run existing package/CLI suites after each integration task. |
| Secret leakage | Password prompts, redaction tests, no credentials in argv/registry/log/status. |
| Slack policy limits future distribution | Document custom single-workspace app scope; keep OAuth/Marketplace out of implementation. |

## Resources Needed

- Official Slack Socket Mode, Events API, Web API, formatting, interactivity, manifest, scope, and rate-limit documentation.
- Official npm packages `@slack/socket-mode` and `@slack/web-api`.
- Existing Telegram adapter, question service, channel runner, configuration, daemon, CLI, and tests.
- No Slack credentials for automated implementation; optional manual sandbox credentials after code review.

## Progress Summary

All tasks are complete under TDD: provider contracts, rendering/chunking, queued delivery, official SDK transport, explicit pairing, expiring Slack interactions, dual-token setup validation, generic runner/daemon/status integration, user documentation, and security review. Task tracing is unavailable because `npx ai-devkit@latest task list --name slack-channel-connector --json` returns `unknown command 'task'`. Fresh lint, build, full tests, targeted coverage, and diff checks pass.
