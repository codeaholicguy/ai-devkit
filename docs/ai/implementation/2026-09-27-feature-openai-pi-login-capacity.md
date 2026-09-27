---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup

- Worktree `.worktrees/feature-openai-pi-login-capacity`, branch `feature/openai-pi-login-capacity` (brief-mandated name), base `b10c0f6` (main).
- `npm ci` at root; unit tests run TS directly via vitest (`packages/agent-manager`); build CLI+agent-manager (`npx nx run-many -t build -p cli agent-manager`) before manual capacity runs.

## Code Structure

- `packages/agent-manager/src/capacity/wham.ts` (new) — shared pure parser for `chatgpt.com/backend-api/wham/usage`: `parseWhamUsage`, `toRateWindow`, `resetTime`, `safeIdentifier` (exported for codex's CLI-fallback path).
- `packages/agent-manager/src/capacity/openai.ts` — tiered `resolveOpenAiCredential` (env → pi `openai` api_key → pi `openai-codex` OAuth → sanitized not-found error), `toEpochMs` (>1e12 ⇒ ms), `jwtExpiryMs` fallback, `fetchWhamUsage` (Bearer + `ChatGPT-Account-Id`, AbortController timeout, 401/403 → null), `probeOpenAiOauthCapacity` classification. `resolveOpenAiApiKey` kept as platform-only compat wrapper.
- `packages/agent-manager/src/capacity/codex.ts` — parsing delegated to `wham.ts`; `parseUsage`/`toRateWindow` re-exported unchanged so `codex.test.ts` passes untouched.
- Tests/fixtures: `wham.test.ts`, extended `openai.test.ts`, `fixtures/openai-codex-auth.json` (fake tokens), `fixtures/wham-usage.json` (redacted live shape).

## Implementation Notes

### Core Features

- **OAuth tier:** fresh token → wham GET → windows (`session`/`weekly`/extras) + credits; stale (`expiresMs ?? JWT exp` ≤ checkedAt) → no fetch, `authenticated:true, available:"unknown"`; 401/403 → `authenticated:false`; transport/5xx/bad-JSON → sanitized throw rendered as per-provider warning.
- **Platform path untouched:** same fetches, same report, byte-identical; platform key wins over OAuth when both exist (tier order).
- **No refresh, no dedupe:** matches codex.ts policy; `pi · OpenAI` and `codex · OpenAI` rows coexist (harness column).

### Patterns & Best Practices

- TDD throughout (red → green per behavior; codex suite was the regression net for the parser extraction).
- Token hygiene: fixtures use `fixture-*` fakes; no-leak assertions on reports and errors; errors carry status codes only.

## Validation Evidence

- Scoped: 70 capacity tests green; agent-manager full suite green (682+ tests).
- Coverage: `openai.ts` / `wham.ts` 100% lines; uncovered branches are only the never-network default-injection arms (`?? globalThis.fetch`, `?? 5000`), consistent with codex.ts/zai.ts.
- Root gates: `npm run lint` ✓ (6 projects), `npm test` ✓ (6 projects), `npm run test:e2e` ✓ (42 tests). Husky pre-commit (`npm run lint` + `npm test`) passed on every commit.
- Live validation (this machine, real login, redacted): default `ai-devkit capacity` now shows `pi · OpenAI` Session/Weekly rows beside `pi · z.ai`, no unavailable warning; `codex · OpenAI` rows unchanged. `capacity openai --json` clean of `access`/`refresh`/`accountId` values (scripted check). Live `creditsRemaining` renders null when the account's `credits.balance` is non-numeric — parser tolerates.

## Deviations & Cleanups

- Not-found error text now mentions the pi login path (only shown when nothing resolves; platform users unaffected). One existing openai.test.ts regex updated accordingly.
- Reverted accidental `oxfmt` reformatting of `codex.test.ts`/`zai.test.ts` (unrelated churn) — suites pass with pristine files.
- `lint --feature` branch-name check expects `feature-openai-pi-login-capacity`; the brief mandates `feature/openai-pi-login-capacity` — documented deviation, docs checks pass.
- Follow-up (out of scope): wham `rate_limit_reached_type` is not surfaced as `available:"no"` for API responses (parity with codex.ts API path); could be revisited for both harnesses together.
