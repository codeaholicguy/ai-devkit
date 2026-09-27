---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

**What problem are we solving?**

- Users who log in to OpenAI through pi (OAuth, credential `openai-codex` in `~/.pi/agent/auth.json`) get no OpenAI status in `ai-devkit capacity` under the pi harness. The default report prints `openai capacity unavailable: OpenAI API key not found` and omits the `pi · OpenAI` rows, even though a valid ChatGPT-backed login exists on the machine.
- Affected users: pi harness users on the ChatGPT/Codex subscription plan who have not provisioned a platform API key (the common case for `pi login`).
- Current workaround: create a platform key and set `OPENAI_API_KEY` or store a pi `openai` `{type: "api_key"}` credential — manual setup the feature must eliminate.

**Verified facts (from discovery; treated as ground truth):**

1. Pi's OpenAI login writes `~/.pi/agent/auth.json` entry `openai-codex` with OAuth shape `{type, access, refresh, expires, accountId}` — `access`/`refresh` are token strings, `expires` is an epoch-**milliseconds** integer, `accountId` is the ChatGPT account UUID. Present on this machine.
2. The merged platform-key provider (#252, `packages/agent-manager/src/capacity/openai.ts`) only resolves `OPENAI_API_KEY` env or a pi `openai` `{type: "api_key", key}` credential. It can never see `openai-codex`. That path must keep working unchanged.
3. Precedent: `capacity/codex.ts` fetches `https://chatgpt.com/backend-api/wham/usage` with OAuth tokens (Bearer + `ChatGPT-Account-Id` headers) and parses `rate_limit` / `additional_rate_limits` windows and credits. The pi `openai-codex` tokens are expected to authorize the same endpoint (validated by a read-only live probe during design).
4. codex.ts policy for stale OAuth: **no refresh attempt**; stale tokens are skipped and the probe falls back. Pi tokens follow the same policy (no new refresh flows).

## Goals & Objectives

**What do we want to achieve?**

- Primary: `ai-devkit capacity` (default report) shows `pi · OpenAI` rows — beside `pi · z.ai` — whenever the user has logged in to OpenAI via pi, with zero manual setup and no platform API key.
- Secondary: identical treatment for `ai-devkit capacity openai` (explicit provider) and `--json` output.
- Keep the platform-key path (env → pi `openai` api_key) fully working and preferred when present; OAuth is the no-setup fallback, not a replacement.
- Never print or persist token values in output, docs, logs, or tests.

**Non-goals (what's explicitly out of scope)**

- No OAuth token refresh implementation (matches codex.ts precedent).
- No changes to the codex harness provider (`codex · OpenAI` rows) or its auth handling.
- No removal/alteration of the platform API-key usage report (tokens today/7-day windows).
- No new providers, subcommands, or render overhaul beyond showing the new rows.

## User Stories & Use Cases

- As a pi user logged in to OpenAI via `pi login`, when I run `ai-devkit capacity`, I see `pi · OpenAI` quota rows (session/weekly windows, credits) beside `pi · z.ai`, without configuring any API key.
- As a user with a platform key (`OPENAI_API_KEY` or pi `openai` api_key), my report is unchanged (token-usage windows), and OAuth is not consulted.
- As a user whose pi OAuth access token is expired, I see a clear authenticated-but-stale state (login detected, usage not fetched) instead of "API key not found".
- As a user with logins in both pi and codex harnesses, both `pi · OpenAI` and `codex · OpenAI` rows appear — the harness column distinguishes them; no dedupe.

**Edge cases**

- `~/.pi/agent/auth.json` missing or malformed → current clear error behavior for the openai provider is preserved (no rows, warning in multi-provider mode).
- `openai-codex` entry malformed (wrong type, missing access/accountId) → skip OAuth path gracefully (fall through to clear error), never expose file content.
- Both platform key and OAuth present → platform key wins; OAuth not used.
- wham/usage returns 401 (revoked OAuth) → render unauthenticated rather than erroring the whole report.

## Success Criteria

- On a machine with only a pi OpenAI OAuth login, default `ai-devkit capacity` shows `pi · OpenAI` rows and no `openai capacity unavailable` warning.
- With `OPENAI_API_KEY` set or pi `openai` api_key present, output is byte-identical to today's platform-key report.
- Expired OAuth renders an authenticated-but-stale `pi · OpenAI` state (no fetch attempted).
- Unit tests: resolution order, staleness classification, wham parsing/window mapping, 401 handling, and no-token-leak assertions — all fixture/mock based, mirroring `openai.test.ts`/`codex.test.ts` patterns. No live network calls in tests.
- Gates: scoped vitest suites, `npm run lint`, `npm test`, `npm run test:e2e` green; commit hooks pass.

## Constraints & Assumptions

- The wham/usage endpoint accepts the pi OAuth tokens (assumption verified once via read-only live GET during design; tests then use fixtures only).
- `expires` is epoch milliseconds (pi convention); codex.ts `expires_at` is seconds — the pi path must not reuse the seconds-based staleness math blindly.
- One live probe against chatgpt.com backend with real stored tokens, read-only GET, results recorded redacted; never committed.
- Token values are never logged, thrown, or written to any artifact.

## Questions & Open Items

All material questions are resolved by the brief and verified discovery (documented above):

1. **Resolution order** — env `OPENAI_API_KEY` → pi `openai` api_key → pi `openai-codex` OAuth. Platform paths stay first because they are correct for platform-key users (brief rule 2); OAuth closes the no-setup gap.
2. **Dedupe/classification** — none. Both harness rows may legitimately coexist; the harness column exists for exactly this.
3. **OAuth refresh** — no refresh (match codex.ts); stale renders authenticated-but-stale.
4. **Reuse vs duplication** — wham parsing gains a second real caller (pi OAuth), which justifies extracting the parser into a shared module rather than duplicating; final call made in design review.

No unresolved items requiring stakeholder input.
