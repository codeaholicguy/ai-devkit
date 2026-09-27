---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones

- [x] M1: Shared wham parsing extracted, codex suite green unchanged
- [x] M2: Pi OAuth tier resolves + classifies (all unit scenarios green)
- [x] M3: Full gates green, docs/implementation updated, final PR open

## Task Breakdown

### Phase 1: Foundation — shared parser

- [x] T1.1: Create `capacity/wham.ts` with `parseWhamUsage`, `toRateWindow`, `extraWindows` + guards (TDD: add `wham.test.ts` scenarios from testing doc first; fixtures `wham-usage.json`). Outcome: pure parser module; validation: `npx vitest run src/__tests__/capacity/wham.test.ts` (agent-manager).
- [x] T1.2: Delegate `codex.ts` parsing to `wham.ts`; keep `parseUsage`/`toRateWindow` exports. Outcome: codex behavior identical; validation: `codex.test.ts` passes unchanged (no edits to that suite).

### Phase 2: Core — OAuth tier in openai.ts

- [x] T2.1: `resolveOpenAiCredential` tiers (env → pi `openai` api_key → pi `openai-codex` oauth → not-found error mentioning pi login); keep `resolveOpenAiApiKey` compat; ms-vs-s + JWT staleness helper. TDD first: extend `openai.test.ts` resolution + staleness scenarios with fixture `openai-codex-auth.json`. Validation: scoped vitest.
- [x] T2.2: OAuth probe path: wham GET (Bearer + `ChatGPT-Account-Id`, abort/timeout), classification (200 report / 401-403 unauthenticated / timeout-5xx-badJSON sanitized throw / stale no-fetch), report assembly mirroring codex API-path semantics; no-leak assertions. Validation: scoped vitest; JSON.stringify scan for fake tokens.

### Phase 3: Integration & gates

- [x] T3.1: Full gates: `npm run lint`, `npm test`, `npm run test:e2e`, hooks (dev-commit) — all green in worktree. Record evidence in implementation doc.
- [x] T3.2: Manual on-machine validation: build CLI, run default `ai-devkit capacity`, confirm `pi · OpenAI` rows beside `pi · z.ai`; redacted output in implementation doc.
- [x] T3.3: Update implementation/testing/planning docs (phases 5-8 flow), grep branch for token substrings (no-leak audit), final PR (dev-pr conventions; do NOT merge).

## Dependencies

- T1.1 → T1.2 → T2.2 (parser before callers). T2.1 independent of T1 but ordered after for clean diffs.
- T3.* depend on all of M1+M2.
- External: none beyond the already-validated wham endpoint (fixtures only from here).

## Timeline & Estimates

- Single-session execution: T1 ~30%, T2 ~50%, T3 ~20%. No calendar dates (autonomous run).

## Risks & Mitigation

- wham shape drift vs fixture → mitigated: parser is defensive (null-tolerant), fixtures from verified live payload.
- Codex test coupling to internal parse functions → mitigated: re-export shims keep imports stable.
- Coverage thresholds (70% floor, new code ~100%) → mitigated: classification branches enumerated in testing doc.
- Epoch-ms vs seconds misclassification → heuristic + JWT fallback, explicit tests for both magnitudes.
- Token leakage → fake fixtures, no-leak assertions, pre-PR grep audit.

## Progress Log

- 2026-09-27: Initial plan created from requirements/design/testing docs. All testing scenarios mapped to tasks (T1.1↔wham parsing, T2.1↔resolution/staleness, T2.2↔classification/no-leak, T3.1↔gates, T3.2↔manual e2e).
- 2026-09-27: M1 done. T1.1 wham.ts + wham.test.ts (TDD red→green; note: scoped-window ids reject spaces by safeIdentifier design — test uses `code-review`). T1.2 codex.ts delegates parsing; exported `resetTime`/`safeIdentifier` from wham.ts because codex's CLI-fallback path uses them (caught by 3 codex CLI-fallback tests going red). All 50 capacity tests + 682 agent-manager tests green; hooks passed.
- 2026-09-27: M2 done via TDD. T2.1: `resolveOpenAiCredential` union + tiers, not-found message now mentions pi login (CLI test uses injected errors — unaffected; openai.test.ts regex updated accordingly). T2.2: OAuth probe with wham fetch/classification; stale no-fetch; JWT fallback. Coverage: openai.ts & wham.ts 100% lines; remaining uncovered branches are the never-network `?? globalThis.fetch`/default-timeout injections, consistent with codex.ts/zai.ts norms. 70 capacity tests + full agent-manager suite green; hooks passed.
- 2026-09-27: M3 done. No-leak audit clean (branch diff + tracked files scanned against real token values). Final gates fresh on HEAD: lint 0 / npm test 0 / e2e 0 (42). Rebased (up to date) onto origin/main, pushed, PR opened: https://github.com/codeaholicguy/ai-devkit/pull/254 (left unmerged for review). Lifecycle complete.
