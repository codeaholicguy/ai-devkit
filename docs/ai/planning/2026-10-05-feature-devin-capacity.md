---
phase: planning
title: Project Planning & Task Breakdown
description: Milestones, task breakdown, dependencies, risks, and progress tracking
---

# Project Planning & Task Breakdown

## Milestones

1. Credential resolution + provider parse/fetch with tests.
2. Source probe + index/CLI wiring with tests.
3. Full gates green; PR open.

## Task Breakdown

### Phase 1: Foundation — credentials + provider

- [x] `harnesses/devin/credentials.ts`: `resolveDevinCredential` — `DEVIN_API_KEY` env → `~/.local/share/devin/credentials.toml` (`windsurf_api_key`); `DEVIN_ORG_ID` env → `~/.config/devin/config.json` `devin.org_id`. Sanitized errors.
- [x] `capacity/providers/devin.ts`: `parseDevinCapacity` + `fetchDevinCapacity` per design mapping.
- [x] Fixtures: `devin-credentials.toml`, `devin-config.json`, `devin-quota.json` (from recorded live shape), `devin-quota-nonplan.json`.

### Phase 2: Core — source + wiring

- [x] `capacity/sources/devin.ts`: `probeDevinCapacity` (401/403 → unauthenticated report).
- [x] `capacity/index.ts`: `getDevinCapacityReport` + option type exports.
- [x] `cli/src/commands/capacity.ts`: provider list + dispatch; `render.ts`: `devin: "Devin"` label.

### Phase 3: Tests & gates

- [x] `__tests__/capacity/devin.test.ts` mirroring zai.test.ts (resolution, mapping, request shape, failure sanitize, no-leak).
- [x] Scoped vitest → `npm run lint` → `npm test` → `npm run test:e2e`.

## Dependencies

- None external; reuses types.ts contracts. No new npm deps.

## Timeline & Estimates

Single-session implementation; no estimates.

## Risks & Mitigation

- **Upstream shape drift** — unknown fields ignored; missing known fields degrade to `usedPercent: null` / unknown availability.
- **Token leakage** — errors sanitize; tests assert absence.
- **Worktree index corruption (repo history)** — `git show --stat HEAD` after every commit; stop on mismatch.

## Progress Log

- 2026-10-05: docs created; exploration complete (live probe 200, shape recorded in requirements).
