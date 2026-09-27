---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals

- Unit coverage of new/changed code: 100% of branches in `wham.ts` parsing, OAuth credential resolution, staleness classification, and response classification.
- Existing suites (`openai.test.ts`, `codex.test.ts`, CLI capacity tests) must pass with no behavioral regressions; platform-key report output byte-identical.
- No live network calls in tests — all fetch via `vi.fn()` injection, all auth via fixtures with fake tokens.
- E2E: existing `npm run test:e2e` suite must stay green; capacity has no e2e cases today, and none are added (unit + render coverage is the established pattern for this command).

## Unit Tests

### `capacity/wham.ts` (shared parser)

- [ ] Parses `rate_limit.primary_window`/`secondary_window` into session/weekly windows with `used_percent`, `limit_window_seconds`→durationMinutes, `reset_at` (epoch seconds and ISO string) → resetsAt (covers codex API mapping parity)
- [ ] Maps `additional_rate_limits` entries into scoped windows; tolerates non-array/absent value (live probe showed non-array)
- [ ] Extracts `credits.balance`; missing credits → null
- [ ] Skips windows it cannot parse without inventing zeros (missing used_percent stays null)
- [ ] Codex suite (`codex.test.ts`) passes unchanged against the delegated parser (regression guard)

### `capacity/openai.ts` — credential resolution

- [ ] `OPENAI_API_KEY` env wins without reading the auth file (existing behavior preserved)
- [ ] pi `openai` api_key credential wins over `openai-codex` when both exist (platform preferred, OAuth not consulted)
- [ ] pi `openai-codex` `{type:"oauth"}` resolves to OAuth credential when no platform key exists
- [ ] Malformed `openai-codex` (wrong type / missing access / missing accountId) is skipped → not-found error, message mentions pi login, never exposes file content
- [ ] Missing auth file (ENOENT) and invalid JSON keep clear sanitized errors

### `capacity/openai.ts` — OAuth probe & classification

- [ ] Fresh token (epoch-ms `expires` in future) → GET wham/usage with `Authorization: Bearer` + `ChatGPT-Account-Id`, timeout abort wiring; 200 → report with `harness:"pi"`, session/weekly windows, credits, `authenticated:true`
- [ ] `expires` in seconds (small magnitude) and JWT-exp fallback both classify correctly; missing metadata defaults to fresh-then-fetch
- [ ] Stale token (expiry ≤ checkedAt) → **no fetch**, `authenticated:true`, `available:"unknown"`, no windows
- [ ] 401/403 from wham → `authenticated:false`, `available:"unknown"`, empty windows
- [ ] Timeout / network error / 5xx / bad JSON → sanitized thrown error (`OpenAI usage request failed…`), no token in message
- [ ] `resolveOpenAiApiKey` compat export unchanged for platform tiers
- [ ] No-token-leak: JSON.stringify of every report/error never contains fixture token strings

### CLI (existing suites)

- [ ] `capacity` command tests keep passing (default provider list unchanged; no CLI code changes)

## Integration Tests

- [ ] `getOpenAiCapacityReport` end-to-end with injected `readFile` (fixture auth) + injected `fetch` (wham 200) → full report shape (windows sorted/renderable, provider label path)
- [ ] Multi-provider flow: OAuth-only machine → openai provider no longer throws (row present) while other providers' failures still warn independently (`capacityCommand` behavior unchanged)

## End-to-End Tests

- [ ] Existing e2e suite green (`npm run test:e2e`); no new e2e (no CLI surface change)
- [ ] Manual validation on this machine: default `ai-devkit capacity` shows `pi · OpenAI` rows beside `pi · z.ai` (documented in implementation doc with redacted output)

## Test Data

- New fixtures in `packages/agent-manager/src/__tests__/capacity/fixtures/`:
  - `openai-codex-auth.json` — fake pi OAuth credential (`type:"oauth"`, JWT-shaped fake access with `exp`, epoch-ms `expires`, fake accountId)
  - `wham-usage.json` — redacted copy of the verified live response shape (windows, credits, top-level keys)
- Existing platform fixtures (`openai-auth.json`, usage payloads) reused unchanged.
- All token-like strings are obvious fakes; real tokens never committed (verified by grepping the branch for token substrings before PR).

## Test Reporting & Coverage

- Commands: `npx vitest run` in `packages/agent-manager` (scoped), then `npm run lint`, `npm test`, `npm run test:e2e` at root; coverage via existing thresholds (70% floor package-wide, new code targeted at 100% branch).
- Coverage gaps: none anticipated; any justified gap documented here with rationale.
- Evidence: command outputs recorded in the implementation doc; final validation in the PR body.
