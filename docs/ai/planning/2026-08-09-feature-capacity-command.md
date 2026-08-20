---
phase: planning
title: Capacity Command Implementation Plan
description: Completed task record for the shipped capacity command
---

# Capacity Command Implementation Plan

All tasks are complete. The list reflects execution order and the pushed commit that delivered each outcome.

## Milestone 1: Detection and Core Contract

- [x] Define schema-v1 capacity types and configuration/PATH detection — `c6c386b`.
  - Outcome: `CapacityReport`, `ProviderCapacity`, arbitrary `CapacityWindow[]`, and independent configured/installed checks.
  - Validation: detection derives config roots from `ENVIRONMENT_DEFINITIONS` and never runs provider binaries.
- [x] Build the Codex app-server adapter under TDD — `d57813a`.
  - Outcome: injectable JSON-line transport, normalized windows, aliases, availability, plan, and reset-credit count.
  - Validation: mocked protocol sequence contains no model-turn method and failures are redacted.

## Milestone 2: Provider Coverage and Orchestration

- [x] Add truthful Claude, Pi, GLM, and unsupported-provider adapters — `c614f27`.
  - Outcome: Claude auth detection, Pi provider-name inspection, GLM detection through z.ai keys, and unknown-capacity stubs.
  - Validation: injected secrets and thrown response details do not reach reports.
- [x] Add parallel orchestration and secure cache — `5de3a72`.
  - Outcome: configured-only default, explicit provider validation, partial-result isolation, timeouts, max-age/refresh behavior, atomic restrictive cache.
  - Validation: mocked adapters prove parallel selection, cache reuse/bypass, and partial failure behavior.

## Milestone 3: CLI and Presentation

- [x] Register and document the command — `69a201d`.
  - Outcome: `registerCapacityCommand` in `cli.ts`, locked options, JSON rendering, human table, warnings, and CLI README examples.
  - Validation: Commander integration forwards the provider and parsed cache options; invalid max-age fails before probing.

## Milestone 4: Live-Protocol and Security Hardening

- [x] Align with the generated Codex app-server protocol — `c04ea1f`.
  - Outcome: exact initialize payload, parameterless rate-limit read, current reset-credit field, duplicate bucket removal, and identifier redaction.
  - Validation: generated-protocol assertions and a live read-only Codex smoke test.
- [x] Harden provider metadata and agent-type mappings — `f34dbc3`.
  - Outcome: reject credential/account-like plan metadata; map Gemini, Grok, and Copilot to shipped agent types.
  - Validation: redaction and mapping regression tests.
- [x] Correct logged-out Claude handling — `5e2cc89`.
  - Outcome: accept bounded JSON stdout from Claude's expected nonzero logged-out exit and use a six-second adapter timeout under the seven-second orchestrator guard.
  - Validation: mocked nonzero behavior plus live `authenticated: false` classification.

## Milestone 5: Tiered Codex Rework

- [x] Rebase the feature onto current `origin/main`.
- [x] Add auth-file resolution and PAT/OAuth/CLI tier selection under TDD.
- [x] Normalize API usage into `UsageSnapshot`, including credit-limit fallbacks and additional windows.
- [x] Harden the CLI fallback with read-only/untrusted flags and both account reads.
- [x] Prove stale/401 fallback, unavailable semantics, and token redaction with mocked boundaries.
- [x] Run clean install, build, lifecycle lint, full repository lint/tests, and E2E tests.
- [ ] Publish the reworked branch and update PR #147.

## Dependencies and Sequencing

1. Types and detection established the provider/report contract.
2. Provider adapters normalized into that contract.
3. Orchestration composed adapters and added cache/timeout behavior.
4. CLI/rendering exposed the report.
5. Fully mocked network/subprocess tests drove the tiered protocol and security fixes.

Runtime dependencies are Node.js, Commander, provider CLIs already installed by the user, and the existing AI DevKit environment definitions. No new package dependency or migration was introduced.

## Risks and Mitigations

- Codex app-server protocol changes: capability failures degrade to unknown; transport and mapping are isolated and tested.
- Undocumented Claude usage endpoint: not used; authentication-only output is explicit.
- Provider failure/latency: parallel probes, subprocess/orchestrator timeouts, and partial results.
- Secret leakage: provider-owned auth, bounded streams, fixed errors, field sanitization, and restrictive normalized cache.
- Misleading capacity: positive availability requires authoritative data; unsupported/missing data remains unknown.

## Deferred Follow-Ups

- Add Claude live capacity only if a safe provider-owned command becomes available.
- Add GLM or other provider adapters only after verifying authoritative, non-inference quota mechanisms.
- Add scheduling/recommendation policy separately from factual collection.
