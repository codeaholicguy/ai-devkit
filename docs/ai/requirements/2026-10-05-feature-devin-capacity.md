---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

**What problem are we solving?**

- Users logged in to the Devin CLI get no Devin status in `ai-devkit capacity`. The default report covers codex, zai, openai, anthropic, and claude — the `devin` harness has no provider, so Devin quota consumption is invisible to capacity-based agent dispatch (AGENTS.md capacity gates).
- Affected users: anyone running `devin` CLI sessions alongside codex/pi/claude agents who wants `ai-devkit capacity` to reflect the Devin pool before starting work.

**Verified facts (from discovery; treated as ground truth):**

1. Token lives at `~/.local/share/devin/credentials.toml` — flat TOML with `windsurf_api_key`, `api_server_url`, `devin_webapp_host`, `devin_api_url`. No org field.
2. Org id lives at `~/.config/devin/config.json` under nested key `devin.org_id` (verified on this machine).
3. `GET https://app.devin.ai/api/<org_id>/billing/quota/usage` with `Authorization: Bearer <windsurf_api_key>` returns HTTP 200 (verified once, read-only probe):
   `{"is_quota_plan":true,"has_quota_allocation":true,"daily_percentage":0,"weekly_percentage":0,"daily_reset_at":"2026-10-06T00:00:00-08:00","weekly_reset_at":"2026-10-11T00:00:00-08:00","overage_balance":0.0,"hide_daily_quota":true}`
4. Precedent: `capacity/providers/zai.ts` (single Bearer fetch + strict parse), `capacity/sources/pi.ts` (credential resolution + report assembly), `harnesses/pi/credentials.ts` (env → file resolution with sanitized errors).

## Goals & Objectives

- Primary: `ai-devkit capacity` default report includes `devin · Devin` rows (daily/weekly quota windows, overage balance as credits) whenever the Devin CLI is logged in.
- Secondary: `ai-devkit capacity devin` and `--json` work identically.
- Honest degrade: no credentials → clear warning in multi-provider mode; 401/403 → `authenticated: false`; non-quota plans → `available: "unknown"` with no fabricated numbers.
- Never print or persist token values in output, docs, logs, or tests.

**Non-goals**

- No auth flow changes, no token refresh, no writes to Devin config files.
- No changes to existing providers or the render layer beyond a provider label.
- No live network calls in tests — fixtures only.

## User Stories & Use Cases

- As a user with Devin CLI logged in, `ai-devkit capacity` shows `devin · Devin` daily and weekly quota rows with used-percent and reset times.
- As a user without Devin credentials, the default report shows a clear `devin capacity unavailable` warning; `ai-devkit capacity devin` exits with the clear error.
- As a user on a non-quota Devin plan (`is_quota_plan`/`has_quota_allocation` false), the report shows an authenticated unknown-availability row instead of fabricated windows.
- When `hide_daily_quota` is true, only the weekly window is shown.

**Edge cases**

- credentials.toml missing/malformed/key absent → clear "Devin credentials not found" style error, never exposing file content.
- config.json missing or `devin.org_id` absent → treated as no usable credential (cannot build URL) with a clear error.
- 401/403 → `authenticated: false` report (renders NOT AUTHENTICATED), not a throw.
- Percentages out of range → clamped to 0–100. Missing reset timestamps → `resetsAt: null`.
- `overage_balance` present → reported as `creditsRemaining` (raw number; unit unlabeled by API — do not fabricate a unit).

## Success Criteria

- Default `ai-devkit capacity` includes `devin · Devin` rows when credentials exist; byte-identical other-provider rows.
- Unit tests cover credential resolution order/failures, response parsing (quota plan, hidden daily, non-quota plan, missing fields), request shape/headers, 401→unauthenticated, and no-token-leak assertions — all fixture-based.
- Gates: scoped vitest, `npm run lint`, `npm test`, `npm run test:e2e` green; commit hooks pass.

## Constraints & Assumptions

- One live read-only probe already performed; all further work uses the recorded shape as fixtures.
- `windsurf_api_key` doubles as the Devin API Bearer token (verified 200).
- `daily_percentage`/`weekly_percentage` are used-percent values (0–100).
- Token values never logged, thrown, or written to artifacts.

## Questions & Open Items

1. **Env override** — support `DEVIN_API_KEY` env before the credentials file, matching the env-first precedent of other providers. Org still comes from config.json.
2. **`overage_balance` semantics** — unit unlabeled by the API; surface as `creditsRemaining` raw value. Documented, not guessed.
3. **`hide_daily_quota`** — omit the daily window when true rather than show a row the webapp hides.

No unresolved items requiring stakeholder input.
