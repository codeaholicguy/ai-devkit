---
phase: testing
title: Testing Strategy
description: Test coverage approach for the tracing integration
---

# Testing Strategy — Tracing Integration

## Coverage goals

- Unit test coverage target: 100% of new code lines/branches where practical.
- The mapping layer is the entire value → every semantic→contract pairing is
  asserted directly.
- No integration test against shipped storage yet (`@ai-devkit/task-manager`
  pending). A wiring test is added when that ships; mapping logic unchanged.

## Unit tests (what shipped)

`packages/task-tracer/tests/`:

### `contract.test.ts`
- [x] `TASK_EVENT_TYPES` equals the locked closed set (14 types).
- [x] No duplicates in the union.

### `in-memory.test.ts` (contract conformance of the test double)
- [x] create → `task.created` event + cached `eventCount`.
- [x] resolveTask: full id → unique prefix → feature (latest non-terminal) order.
- [x] resolveTask: ambiguous prefix throws `AmbiguousTaskPrefixError`.
- [x] get: miss throws `TaskNotFoundError`.
- [x] all stateful mutators append the matching event type and mutate the snapshot.
- [x] `task.note.append` / `task.custom` are event-only (no snapshot mutation).
- [x] actor forwarded as the emitting actor on events.

### `TaskTracer.test.ts` (semantic → contract mapping)
- [x] ensureFeatureTask create-on-miss / reuse-on-hit.
- [x] enterPhase → `task.phase.set` (with `previous`).
- [x] updateProgress → `task.progress.set`.
- [x] setNextStep → `task.next_step.set`.
- [x] raiseBlocker/resolveBlocker → `task.blocker.add`/`.resolve`.
- [x] recordValidation → `task.evidence.add`.
- [x] setAttribution → `task.attribution.set`.
- [x] addNote → `task.note.append` (event-only).
- [x] recordCustom → `task.custom` (event-only observability).
- [x] closeTask → `task.closed`.
- [x] explicit actor forwarded via `opts.actor`.

### `status.test.ts` (read surface)
- [x] null when no task matches.
- [x] digest projects phase/progress/nextStep/openBlockers/attribution.
- [x] lastValidation uses most recent evidence; stale flag true at threshold 0.
- [x] open blockers only (resolved filtered out).

### `cli-argv.test.ts` (CLI argv builders)
- [x] create/show/list/phase/status/next/progress/blocker/evidence/artifact/assign/note/event/close.
- [x] `--passed`/`--failed` toggle; repeated `--artifact`; `--clear`.
- [x] global flags append in contract order.

## Integration tests

Deferred until `@ai-devkit/task-manager` ships: a wiring test injecting the real
`TaskService` into `TaskTracer` and round-tripping one emit per semantic. The
in-memory test double already exercises the exact locked semantics, so coverage
of the mapping is complete today.

## End-to-end

Out of MVP scope. The real end-to-end is a `dev-lifecycle` run that emits
phase/evidence events via the CLI builders and `readStatus` reflects them; this
lands when the skill SKILL.md files are wired (follow-up).

## Validation (fresh evidence, this session)

- `tsc --noEmit` → exit 0.
- `vitest run` → 38 passed, exit 0.
- `swc` build + `tsc --emitDeclarationOnly` → dist + `.d.ts` emitted, exit 0.
