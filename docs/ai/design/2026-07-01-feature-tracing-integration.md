---
phase: design
title: System Design & Architecture
description: How the tracing integration is built against the locked Task contract
---

# Design — Tracing Integration (task-system consumer)

> Contract source: `feature-task-system` worktree
> `docs/ai/design/2026-07-01-feature-task-system.CONTRACT.md` (LOCKED).
> This design consumes that contract; it owns no task storage.

## 1. Role

`task-tracer` is the **tracing semantic layer** that maps dev-lifecycle /
structured-debug progress onto the locked Task contract. Task is the durable unit;
tracing = task progress/events. Two surfaces:

1. **Emit** — phase / progress / next-step / blocker / validation / attribution
   written to a feature's task via the Task contract.
2. **Read** — a status digest for orchestrator/parent agents to route work.

## 2. Architecture: PORT (dependency inversion)

`task-system-feature` locked the contract *document* but has not shipped
`@ai-devkit/task-manager` code yet. We build against the contract as a **port**:

```
                 consumes (async)
  TaskTracer ─────────────────────────► ITaskService (port interface)
       │                                      ▲
       │                                      │ implements
       ▼                                      │
  CLI argv builders                  @ai-devkit/task-manager (TaskService)
  (for skills to shell out)          InMemoryTaskService (test fake)
```

- `ITaskService` mirrors the locked `TaskService` API **exactly**, all methods
  **async/Promise-returning** (confirmed). Field/type names verbatim.
- `TaskTracer` depends only on `ITaskService`, never on storage. Swap fakes ↔ real
  service with zero mapping-logic change.
- An `InMemoryTaskService` (test double) implements the full contract in-memory so
  the mapping is unit-tested today against the exact locked semantics.

## 3. Semantic → contract mapping (FROZEN, 1:1, no new types)

| Tracing semantic | Contract event type | TaskService call |
|---|---|---|
| ensure feature task exists | `task.created` (on miss) | `resolveTask({feature})` → `create(...)` |
| phase.enter / phase.exit | `task.phase.set` | `setPhase(id, phase, {actor})` |
| status advance (active/blocked) | `task.status.set` | `setStatus(id, status, {actor})` |
| progress.update | `task.progress.set` | `setProgress(id, {text?,percent?}, {actor})` |
| next_step.set | `task.next_step.set` | `setNextStep(id, step, {actor})` |
| blocker.add | `task.blocker.add` | `addBlocker(id, {text}, {actor})` |
| blocker.resolve | `task.blocker.resolve` | `resolveBlocker(id, blockerId, {actor})` |
| validation.record | `task.evidence.add` | `addEvidence(id, {command?,exitCode?,passed,summary?,artifacts?}, {actor})` |
| attribution.record | `task.attribution.set` | `setAttribution(id, actor, {actor})` |
| note.append | `task.note.append` | `addNote(id, text, {actor})` |
| generic observability | `task.custom` | `addEvent(id, "task.custom", {name,data}, {actor})` |
| lifecycle end | `task.closed` | `close(id, "completed"|"abandoned", {actor})` |

Mapping is centralized in `TaskTracer` methods; each method calls exactly one
`TaskService` mutator. No event-type strings are invented.

## 4. Feature↔Task model (locked)

ONE task per feature default; `phase` is a single first-class field advanced via
`setPhase`. `ensureFeatureTask(feature, {...})`:
1. `resolveTask({ feature })` → latest non-terminal task.
2. On miss → `create({ title, feature, phase?, actor? })`.
3. Returns `{ task, created }`.

Ad-hoc debug tasks omit `feature` and are addressed by taskId directly.

## 5. Attribution

Auto-resolution is the contract's job. The tracer accepts an optional `actor` on
each call (for multi-agent explicit attribution) and forwards it via `opts.actor`.
When omitted, the real `TaskService` fills it from flags/env/registry; the in-memory
fake records `null` (valid per contract). No agent-manager dependency in the tracer.

## 6. Read surface: status digest

`readStatus(ref)` → `resolveTask(ref)` → project a digest:
`{ taskId, feature, status, phase, phaseEnteredAt, progress, nextStep,
openBlockers[], lastValidation?, updatedAt, attribution?, stale? }`.
`lastValidation` = latest `evidence[]` entry; `stale` = `lastValidation.recordedAt`
older than a threshold (default 24h). This is the orchestrator routing view.

## 7. CLI argv builders (skill integration)

Skills ultimately shell out to `ai-devkit task ...` (owned by `task-system-feature`).
`task-tracer` ships **pure argv builders** (`buildPhaseArgv`, `buildEvidenceArgv`,
etc.) so the exact CLI verbs/flags live in one tested place and skills reference
them deterministically. Builders produce `string[]`; they never execute. This keeps
tracing decoupled from whether the `task` CLI is shipped yet.

## 8. Package layout (`packages/task-tracer`)

```
src/
  contract.ts          # Port: Task/TaskEvent/Actor/ITaskService (mirror of locked contract)
  TaskTracer.ts        # Semantic → contract mapping (emit + ensureFeatureTask)
  status.ts            # readStatus digest + staleness
  cli-argv.ts          # CLI argv builders for skill integration
  in-memory.ts         # InMemoryTaskService (test double; NOT shipped storage)
  index.ts             # public exports
__tests__/             # vitest unit tests (mapping, digest, argv, in-memory contract)
```

`task-tracer` declares a **peer/optional** dependency on `@ai-devkit/task-manager`;
at runtime the consumer injects the real `TaskService`. Until shipped, callers use
the in-memory fake (tests) or defer wiring.

## 9. Skill integration (docs, applied in follow-up)

- `dev-lifecycle`: `task.phase.set` on every phase transition; `ensureFeatureTask`
  at start; `readStatus` at resume.
- `dev-planning`/`dev-implementation`: `task.progress.set` on task toggles.
- `verify`/`tdd`/`dev-testing`: `task.evidence.add` after fresh evidence.
- Any phase: `task.blocker.add`/`resolve`, `task.next_step.set`.
- `structured-debug`: reuse generic events (`evidence.add`/`next_step.set`/
  `blocker.*`/`note.append`); no debug-specific vocab in MVP.

## 10. Tradeoffs

- **Port vs wait:** building the port now (vs waiting for shipped code) is correct
  because the contract is frozen and the mapping is the entire value; the real
  service is a drop-in. Risk = shipped type-name divergence → mitigated by the
  sibling worker's "ping before publish" commitment and an integration test stub.
- **In-memory fake:** doubles as a contract conformance spec; small and disposable
  once the real package ships.
- **CLI argv builders vs a `trace` command:** we deliberately do NOT add a
  `trace` command (forbidden: "no separate session-trace model"). Builders feed the
  upstream `task` CLI.

## 11. Out of scope (MVP)

`task` command implementation, task storage, SQLite backend, structured-debug
vocab, a console TUI pane, dependency/assignee fields, parent/child tasks.
