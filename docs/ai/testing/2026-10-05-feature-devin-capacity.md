---
phase: testing
title: Testing Strategy
description: Coverage goals, test cases, test data, and reporting for Devin capacity
---

# Testing Strategy

## Test Coverage Goals

All new code paths covered with fixture/mock tests; zero live network calls.

## Unit Tests

### `harnesses/devin/credentials.ts` — resolution

- `DEVIN_API_KEY` + `DEVIN_ORG_ID` env win without reading files.
- Reads `windsurf_api_key` from `~/.local/share/devin/credentials.toml` and `devin.org_id` from `~/.config/devin/config.json` (HOME-relative paths asserted).
- Missing file (ENOENT), malformed TOML/JSON, missing key, missing org → clear sanitized errors, no file content leaked.

### `capacity/providers/devin.ts` — mapping

- Fixture: full quota response → daily+weekly windows (percent, resetsAt, durations), `creditsRemaining` from `overage_balance`, `available` from window percent.
- `hide_daily_quota: true` → weekly only.
- `is_quota_plan`/`has_quota_allocation` false → authenticated, `available: "unknown"`, no windows.
- Out-of-range percentages clamped; missing percentage → `usedPercent: null`; missing reset → `resetsAt: null`.
- Non-object/garbage input → throws `Devin quota` error.

### Probe (`capacity/sources/devin.ts`)

- GET `https://app.devin.ai/api/<org>/billing/quota/usage` with only `Authorization: Bearer` header.
- 401/403 → `authenticated: false` report (no throw).
- Other non-200 → `Devin quota request failed: HTTP <status>`; malformed JSON → clear error; report JSON never contains the token.
- Harness/provider stamped `devin`/`devin`.

### CLI (existing suites)

- `capacity devin` dispatched; unknown-provider error lists `devin`; default run includes devin report.

## Integration Tests

None new — covered by command-level mocks.

## End-to-End Tests

`npm run test:e2e` unchanged; must stay green.

## Test Data

Fixtures in `src/__tests__/capacity/fixtures/`: `devin-credentials.toml` (fake key), `devin-config.json` (fake org), `devin-quota.json` (recorded live shape, fake timestamps), `devin-quota-nonplan.json`.

## Test Reporting & Coverage

Scoped vitest runs green; full `npm test` green.
