# @ai-devkit/task-tracer

Tracing layer that maps **dev-lifecycle / structured-debug** progress onto the
ai-devkit **Task** contract. Task is the durable unit; tracing = task
progress/events. Owns no storage — consumes a `TaskService` port only.

> Contract source (LOCKED): `docs/ai/design/2026-07-01-feature-task-system.CONTRACT.md`
> from the `feature-task-system` worktree.

## Why

When running `dev-lifecycle` / `structured-debug`, there was no single place
answering "where are we right now?" — phase, progress, blockers, last validation,
next step, owner. The Task system is now the durable unit; this package is the
thin mapping from workflow progress semantics to Task events.

## Architecture: PORT (dependency inversion)

```
                 consumes (async)
  TaskTracer ─────────────────────────► ITaskService (port interface)
       │                                      ▲
       │                                      │ implements
       ▼                                      │
  CLI argv builders                  @ai-devkit/task-manager (TaskService, upcoming)
  (for skills to shell out)          InMemoryTaskService (test double)
```

`task-tracer` depends only on `ITaskService` (a verbatim async mirror of the
locked `TaskService` API). It never writes `~/.ai-devkit/tasks/<id>/`. When
`@ai-devkit/task-manager` ships its `TaskService`, inject it directly — mapping
logic is unchanged. An `InMemoryTaskService` test double lets you exercise the
exact contract today.

## Install / wire

```ts
import { TaskTracer, readStatus } from '@ai-devkit/task-tracer';
import { TaskService } from '@ai-devkit/task-manager'; // when shipped

const service = new TaskService({ store: process.env.AIDEVKIT_TASKS_DIR });
const tracer = new TaskTracer(service);

const { task, created } = await tracer.ensureFeatureTask({ feature: 'auth', phase: 'design' });
await tracer.enterPhase(task.taskId, 'implementation');
await tracer.recordValidation(task.taskId, { command: 'nx test', exitCode: 0, passed: true, summary: 'green' });

const digest = await readStatus(service, { feature: 'auth' });
console.log(digest.phase, digest.lastValidation?.stale);
```

## Semantic → contract mapping

| Tracing method | Contract event | Note |
|---|---|---|
| `ensureFeatureTask` | `task.created` (on miss) | resolveTask({feature}) → create |
| `enterPhase` | `task.phase.set` | phase.enter/exit |
| `setStatus` | `task.status.set` | |
| `updateProgress` | `task.progress.set` | progress.update |
| `setNextStep` | `task.next_step.set` | |
| `raiseBlocker` / `resolveBlocker` | `task.blocker.add` / `.resolve` | |
| `recordValidation` | `task.evidence.add` | validation.record (verify/tdd) |
| `setAttribution` | `task.attribution.set` | attribution.record |
| `addNote` | `task.note.append` | event-only |
| `recordCustom` | `task.custom` | event-only observability |
| `closeTask` | `task.closed` | |

No event types are invented. Feature↔Task: **one task per feature default;
`phase` is a single first-class field.**

## Attribution

`actor` is optional on every call. When omitted, the real `TaskService`
auto-resolves from `AIDEVKIT_AGENT_*` env / agent-manager registry (null is
valid). For deterministic attribution in multi-agent contexts, build an explicit
actor with `resolveActor({ agentId, agentType })`.

## CLI argv builders

Skills shell out to `ai-devkit task ...` (owned upstream). Centralized, pure
builders keep the verbs/flags in one tested place:

```ts
import { buildEvidenceArgv } from '@ai-devkit/task-tracer';
const argv = buildEvidenceArgv(taskId, { command: 'nx test', exitCode: 0, passed: true });
// ['task','evidence',taskId,'--passed','--command','nx test','--exit-code','0']
```

## Scripts

```bash
npm test          # vitest run
npm run build     # swc + declarations
npm run typecheck # tsc --noEmit
```

## Status

MVP. Out of scope: task storage, SQLite backend, a `trace` CLI command,
structured-debug-specific event vocabulary, console TUI pane, dependency/assignee
fields, parent/child tasks.
