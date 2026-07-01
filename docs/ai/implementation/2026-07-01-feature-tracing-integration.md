---
phase: implementation
title: Implementation Guide
description: What shipped in the tracing integration and how skills integrate
---

# Implementation — Tracing Integration

## What shipped (`packages/task-tracer`)

| File | Role |
|---|---|
| `src/contract.ts` | Port: `Actor`, `Task`, `TaskEvent`, `TaskEventType` (closed union), `ITaskService` (async), inputs, errors — verbatim mirror of the LOCKED contract. |
| `src/in-memory.ts` | `InMemoryTaskService` — faithful contract test double (NOT shipped storage). |
| `src/TaskTracer.ts` | Semantic → contract mapping facade. One method per tracing semantic; each calls exactly one `ITaskService` mutator. |
| `src/status.ts` | `readStatus` / `digest` — orchestrator routing view with staleness. |
| `src/ActorResolver.ts` | `resolveActor` — explicit-actor helper (no storage dep). |
| `src/cli-argv.ts` | Pure argv builders for the upstream `ai-devkit task` CLI. |
| `src/index.ts` | Public exports. |

## Design invariants enforced by code

- **No new event types:** `TASK_EVENT_TYPES` is asserted equal to the locked set
  by `tests/contract.test.ts`.
- **No storage writes:** `task-tracer` imports nothing that touches the
  filesystem; it depends only on `ITaskService`. Verified by review + test.
- **Async port:** every `ITaskService` method returns `Promise` (matches the
  shipped `TaskService` confirmed async).
- **One-mutator-per-semantic:** `TaskTracer` methods each call exactly one
  service mutator (or `addEvent` for the `task.custom` escape hatch).

## Wiring when `@ai-devkit/task-manager` ships

```ts
import { TaskTracer } from '@ai-devkit/task-tracer';
import { TaskService } from '@ai-devkit/task-manager'; // implements ITaskService

const service = new TaskService({ store: process.env.AIDEVKIT_TASKS_DIR });
const tracer = new TaskTracer(service);
```

Zero changes to mapping logic. If the shipped type names diverge from the
contract, `task-system-feature` will ping before publish (coordination
commitment). Add an integration test at that point.

## Skill integration guide (applied in a follow-up to SKILL.md files)

These are one-line emits at deterministic checkpoints. Each uses the CLI argv
builders so the exact verb/flags live in one place.

### dev-lifecycle
- **Start of run:** `ensureFeatureTask({ feature, phase })` (creates on miss).
- **On every phase transition:** `enterPhase(taskId, phase)` →
  argv `buildPhaseArgv`.
- **At resume:** `readStatus({ feature })` instead of re-deriving from scratch.

### dev-planning / dev-implementation
- **On task toggle:** `updateProgress(taskId, { percent, text })` →
  `buildProgressArgv`.

### verify / tdd / dev-testing
- **After fresh evidence:** `recordValidation(taskId, { command, exitCode, passed, summary })` →
  `buildEvidenceArgv`. This is what makes "last validation" trustworthy.

### Any phase
- **Blocker discovered:** `raiseBlocker` → `buildBlockerAddArgv`; resolved →
  `resolveBlocker` → `buildBlockerResolveArgv`.
- **Next step:** `setNextStep` → `buildNextArgv`.

### structured-debug (MVP)
- Reuses generic semantics: `recordValidation` (repro evidence),
  `setNextStep` (next hypothesis), `raiseBlocker`/`resolveBlocker`,
  `addNote`. No debug-specific vocab in MVP.

## Deviations from design

- None material. `status.ts` staleness uses `age >= staleAfterMs` (inclusive
  boundary) so a threshold of 0 flags any recorded evidence as stale — recorded
  in the design's tradeoffs as the boundary semantic.
