---
phase: planning
title: Implementation Plan
description: Task breakdown, milestones, and risks
---

# Implementation Plan

## Milestones

1. **M1 Writers + spec** — memory-mcp module with six writers, tested (TDD).
2. **M2 Setup integration** — new agents/steps, command surface, idempotence tests.
3. **M3 Status + descriptions** — status `memoryMcp` check; memory tool description text.
4. **M4 E2E + docs + PR** — isolated-HOME e2e, progress file, changelog-adjacent docs, PR.

## Task Breakdown

### Phase 1: Foundation

- [x] T1: `memory-mcp/spec.ts` — server spec, wired/unsupported agent lists with reasons (+ unit tests)
- [x] T2: JSON writers (claude/gemini/cursor/opencode/grok) with upsert/idempotence/preservation tests — **revised per design update**: claude/gemini/cursor/opencode now reuse scope-aware install/mcp generators; grok keeps a standalone writer

### Phase 2: Core Features

- [x] T3: Codex TOML textual upsert writer (+ comment-preservation & parse round-trip tests) — lives in CodexMcpGenerator user-scope write path
- [x] T4: `memory-mcp` facade + `setup.service.ts` new definitions + `memory-mcp` steps; `--agent` surface (+ setup-service tests)

### Phase 3: Integration & Polish

- [x] T5: `status.service.ts` memory-MCP read-only check (+ tests, render row)
- [x] T6: memory server tool description rewrite (text-only) (+ description tests)
- [x] T7: e2e isolated-HOME test — built CLI run asserting config contents per environment + idempotence + --agent validation
- [ ] T8: docs (progress file sync, PR body with rationale + evidence), full gates (`npm test`, lint, typecheck, build), final PR

## Dependencies

- T2/T3 depend on T1 (spec). T4 depends on T1–T3. T5 depends on T4 (inspect API). T7 depends on T4. T8 last.

## Timeline & Estimates

- T1–T2: ~1h; T3: ~45m; T4: ~1h; T5: ~30m; T6: ~20m; T7: ~45m; T8: ~45m. Single agent, sequential.

## Risks & Mitigations

- **Harness config drift upstream** (e.g. grok changing its settings schema) → writers are isolated per harness with their own tests; verified against pinned doc/source links recorded in progress file.
- **TOML corruption** → textual upsert never rewrites untouched bytes; round-trip parse test.
- **`~/.claude.json` size/state** → read-modify-write with JSON parse/stringify only; single key touched; tested with realistic fixture.

## Resources Needed

- Node ≥ 20.20 toolchain (present), network for npm ci (done), GitHub remote for PR (present).
