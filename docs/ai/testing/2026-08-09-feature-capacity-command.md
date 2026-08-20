---
phase: testing
title: Capacity Command Testing Record
description: Automated coverage, fixtures, real smoke checks, and final gate evidence
---

# Capacity Command Testing Record

## Strategy and Isolation

The feature was built with red-green-refactor cycles. Pure mapping and detection logic are unit tested, subprocess/filesystem boundaries are injected, and orchestration composes mocked adapters. CI never launches a real provider subprocess and never accesses a provider network endpoint.

## Automated Test Inventory

### `detection.test.ts`

- [x] Derive configured providers from `ENVIRONMENT_DEFINITIONS.globalSkillPath`, including nested `.config/opencode`.
- [x] Check executable presence on PATH without running a provider CLI.

### `codex.test.ts`

- [x] Resolve `CODEX_HOME/auth.json`, home fallback, and missing-file CLI fallback.
- [x] Select PAT before OAuth and exercise PAT `whoami` plus usage calls.
- [x] Exercise fresh OAuth usage plus stale-token and 401 CLI fallback.
- [x] Mock every network and subprocess boundary.
- [x] Map API session/weekly windows, reset timestamps, credit balance, individual-limit fallback chain, and additional limits.
- [x] Launch the fallback contract with read-only/untrusted flags and both account reads.
- [x] Assert PAT, access-token, refresh-token, and raw transport failures never appear in output.
- [x] Normalize primary, secondary, and multi-bucket arbitrary windows.
- [x] Derive daily/weekly aliases by duration and report unredeemed reset-credit counts.
- [x] Deduplicate the compatibility `rateLimits` view against `rateLimitsByLimitId`.
- [x] Keep missing capacity unknown rather than positive.
- [x] Map explicit exhaustion to `available: no` without exposing reached details.
- [x] Reject URL/account-like identifiers and unsafe plan metadata.
- [x] Assert the exact initialize/initialized/rate-limit-read sequence contains no model/prompt/turn method.
- [x] Redact transport exception text.

The response fixture is synthetic and redacted; it contains no real account data.

### `providers.test.ts`

- [x] Parse Claude logged-out JSON from a nonzero CLI exit while ignoring stderr.
- [x] Detect Claude authentication, apply the guarded timeout, and leave live usage unknown.
- [x] Redact Claude failures and unsafe subscription metadata.
- [x] Detect Pi and GLM authentication from provider names without exposing credential values.
- [x] Return correct agent types and truthful unknown capacity for unsupported providers.

### `orchestrate.test.ts`

- [x] Probe only configured providers by default.
- [x] Run independent probes and preserve a report when one fails.
- [x] Use a fresh cache and bypass it with `--refresh`.
- [x] Reject unknown explicit provider names.

### `cache.test.ts`

- [x] Store only the normalized key/report envelope.
- [x] Write cache files with mode `0600`.
- [x] Accept fresh matching entries and reject stale entries.

### `command.test.ts`

- [x] Render exact schema-v1 JSON through terminal UI.
- [x] Render human labels, arbitrary short/long windows, credits, and warnings.
- [x] Exercise Commander wiring with an injected report reader; no live adapter is called.
- [x] Reject invalid max-age values before probing.

## Fresh Final Gates

| Gate | Result |
|---|---|
| `npm ci` | Exit 0 |
| `npm run build` | Exit 0; six projects built, 217 CLI files compiled |
| `npm run lint` | Exit 0; six pre-existing warnings, zero errors |
| `npm run test` | Exit 0; 145 test files, 1,961 tests passed |
| `npm run test:e2e` | Exit 0; 41 tests passed |
| `npx ai-devkit@latest lint --feature capacity-command` | Exit 0; one branch-name warning |

## Isolation Policy

The rework deliberately performs no live credential, network, or app-server smoke test. All HTTP responses, auth-file reads, and subprocess protocol responses are synthetic and mocked so verification cannot consume quota or expose local credentials.

## Regression Policy

Any future provider adapter must use a redacted synthetic fixture, mock external transport in CI, prove unknown-data behavior, and add a real read-only smoke procedure that does not consume model quota. Credential-bearing diagnostics must never be added to snapshots or failure assertions.
