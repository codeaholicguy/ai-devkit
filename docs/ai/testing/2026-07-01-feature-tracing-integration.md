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

**`tests/integration.task-manager.test.ts`** validates against the SHIPPED
`@ai-devkit/task-manager` (PR #132):
- [x] real `TaskService` is assignable to `ITaskService` (compile-time).
- [x] `ensureFeatureTask` create-on-miss / reuse-on-hit via the real service.
- [x] each semantic round-trips and persists to real file-backed storage with
  the exact contract event-type strings.
- [x] `readStatus` projects a digest from the real service.
- [x] no new event types produced (contract integrity).

The suite is **guarded**: it skips cleanly (1 passed | 5 skipped) when
`@ai-devkit/task-manager` is not resolvable, so this branch's standalone CI is
green before #132 merges, and the suite auto-activates once #132 lands and the
workspace symlink materializes. Verified both states locally.

## End-to-end

Out of MVP scope. The real end-to-end is a `dev-lifecycle` run that emits
phase/evidence events via the CLI builders and `readStatus` reflects them; this
lands when the skill SKILL.md files are wired (follow-up).

## Validation (fresh evidence, this session)

- `tsc --noEmit` (with real task-manager types resolvable) → exit 0.
- `vitest run` → 44 passed, exit 0 (38 unit + 6 real integration against the
  shipped `@ai-devkit/task-manager`).
- Guard confirmed: with the package absent → 1 passed | 5 skipped, exit 0.
- `swc` build + `tsc --emitDeclarationOnly` → dist + `.d.ts` emitted, exit 0.
