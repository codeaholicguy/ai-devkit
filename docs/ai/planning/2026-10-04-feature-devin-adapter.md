---
phase: planning
title: "Devin Adapter - Implementation Plan"
feature: devin-adapter
description: Ordered implementation tasks for the Devin harness adapter
---

# Implementation Plan: Devin Adapter

## Milestone 1 — Core files (TDD: failing tests first)

- [x] **T1. Test scaffolding + fixtures**
  - Outcome: `src/__tests__/harnesses/devin/` with a `writeDatabase` helper building `sessions`/`message_nodes`/`prompt_history` and a `writeLocks` helper; empty implementation files compile.
  - Validation: `vitest run src/__tests__/harnesses/devin` collects suites (all failing/red).
  - Covers: fixture requirements from testing doc.

- [x] **T2. `DevinSessionLocator.ts`**
  - Outcome: `resolveDbPath`, `resolveLocksDir`, `openDb` (readonly, cached), `listActiveLocks`, `findSessionForDirectory`, `findSessionById`, `listSessions`, `findSessionsById`, `dbPath` accessor, `close()`.
  - Depends: T1.
  - Validation: locator suite green.

- [x] **T3. `DevinSessionParser.ts`**
  - Outcome: `getConversation` (flatten, `message_id` dedupe, role filter, verbose tool/thinking, SQL-bounded `tail`) + `getSessionStats` (frontier role, lastTimeUpdated, summary).
  - Depends: T1.
  - Validation: parser suite green.

- [x] **T4. `DevinAgentMapper.ts`**
  - Outcome: `mapSessionToAgent` (status rules, `dbPath::slug` ref) + `mapProcessOnlyAgent`.
  - Depends: T1.
  - Validation: mapper suite green.

## Milestone 2 — Adapter + registration

- [x] **T5. `DevinAdapter.ts`**
  - Outcome: `canHandle` subcommand filter, `detectAgents` (acp-child drop, lock join, cwd fallback, process-only), `getConversation`, `listSessions`, `findSessionsById`, lifecycle cleanup.
  - Depends: T2, T3, T4.
  - Validation: adapter suite green incl. lock/cwd/dedupe scenarios.

- [x] **T6. Registration**
  - Outcome: `"devin"` in `AGENT_TYPES`; `DevinAdapter` in `createBuiltinAdapters()`; `HARNESS_RUNTIME_PROFILES.devin`; `agent sessions` help text.
  - Depends: T5.
  - Validation: `builtinAdapters.test.ts`, `runtimeProfiles.test.ts` green; `tsc` clean.

- [x] **T7. `readiness.ts` + profile registration**
  - Outcome: `devinReadiness` probe + `READINESS_PROFILES.devin`.
  - Depends: T6 (type must exist).
  - Validation: readiness tests green.

## Milestone 3 — Hardening + e2e

- [x] **T8. Full package verification**
  - Outcome: `npm test --workspace=@ai-devkit/agent-manager` green; `npm run build`/typecheck clean; cli tests unaffected.
  - Depends: T5–T7.
  - Validation: suite exit 0.

- [x] **T9. Live verification**
  - Outcome: real `devin` TUI detected by `ai-devkit agent list`; `agent detail` shows conversation; `agent sessions` lists slug.
  - Depends: T8.
  - Validation: command outputs captured as task evidence.

- [x] **T10. Docs reconciliation**
  - Outcome: implementation doc filled; planning statuses reconciled; memory entries stored (lock-matching pattern, devin storage schema).
  - Depends: T9.

## Risks & notes

- **Schema drift**: all queries column-minimal and try/catch; `hidden`/`is_user_input` treated as optional semantics (absence tolerated in fixtures).
- **`tail` over-fetch factor (×8)**: if tests show revisions/tools eating the window, raise or loop-fetch.
- **acp dedupe relies on `ppid` enrichment** — verify `captureProcessSnapshot` populates `ppid` on macOS/Linux before relying on it (fallback: also dedupe by lock pid).
- Sequencing: T2–T4 independent; parallelizable but written serially. Subtract-before-add: no existing code paths change except registration appends.
