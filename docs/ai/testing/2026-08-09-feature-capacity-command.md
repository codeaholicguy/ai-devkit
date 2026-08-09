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

## Coverage

The full CLI coverage run passed repository thresholds:

- Statements: 71.47%
- Branches: 62.04%
- Functions: 70.06%
- Lines: 72.77%
- Capacity core modules: 80.59% statements and 85.98% lines

The lower direct coverage in the default Codex transport is intentional: CI tests the injected protocol contract and mapper rather than spawning a real authenticated provider process.

## Fresh Final Gates

| Gate | Result |
|---|---|
| `cd packages/cli && npm run lint` | Exit 0; five pre-existing warnings, zero errors |
| `cd packages/cli && npm test` | 85 test files, 953 tests passed |
| `cd packages/cli && npm run build` | Exit 0; 207 files compiled |
| `cd packages/cli && npm run test:coverage` | Exit 0; repository thresholds passed |
| PR #147 CI | 7/7 checks green |

## Real-Run Smoke Results

The built CLI was run on the development machine with configured Claude, Codex, and Pi/z.ai state:

- [x] `capacity --json --refresh` returned only configured providers: Claude, Codex, Pi, and GLM-through-Pi.
- [x] Codex app-server returned a live authoritative 10,080-minute window and reset-credit count through `account/rateLimits/read`.
- [x] The request sequence contained no model turn and no reset-credit consume operation.
- [x] Claude logged-out state normalized to `authenticated: false`, `status: unauthenticated`, and `available: unknown`.
- [x] Pi and GLM normalized to authenticated but unsupported/unknown.
- [x] Output and test scans contained no tokens, account IDs, endpoint bodies, headers, or credential values.
- [x] `capacity --max-age=-1` exited 1 with a validation error.
- [x] Existing `agent list --json` exited 0, confirming the adjacent command remained functional.

## Regression Policy

Any future provider adapter must use a redacted synthetic fixture, mock external transport in CI, prove unknown-data behavior, and add a real read-only smoke procedure that does not consume model quota. Credential-bearing diagnostics must never be added to snapshots or failure assertions.
