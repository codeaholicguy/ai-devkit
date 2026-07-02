# @ai-devkit/task-manager

Durable task system for AI DevKit. A **task** is the durable unit for
development/debug work, with a stable task id and encapsulated artifacts, evidence,
progress, blockers, workflow phase, ownership/agent attribution, branch/worktree/PR
links, and an append-only event history.

## Storage (SQLite)

Tasks are stored in a single SQLite database at `~/.ai-devkit/tasks.db`:

- **`tasks`** — one row per task snapshot (full Task JSON + indexed query columns).
- **`task_events`** — append-only event history (one row per event).

Uses `better-sqlite3` with WAL + `busy_timeout` (same library and approach as
`@ai-devkit/memory`). Task/event ids are raw UUIDv4 (`crypto.randomUUID()`), stored as TEXT
(globally unique, no collision checks). CLI callers can configure `.ai-devkit.json`
`tasks.path` or override it with `--db-path`; library callers pass an explicit path to
`createTaskService`, `TaskRepository`, or `DatabaseConnection`. `TaskRepository` owns
task/event persistence over the shared SQLite connection.

## Quick start

```ts
import { createTaskService } from '@ai-devkit/task-manager';

const service = createTaskService(); // ~/.ai-devkit/tasks.db

const task = await service.create({ title: 'Ship feature X', feature: 'feature-x', phase: 'requirements' });

await service.setPhase(task.taskId, 'design');
await service.setProgress(task.taskId, { text: 'halfway', percent: 50 });
await service.addEvidence(task.taskId, { command: 'nx test', exitCode: 0, passed: true, summary: 'all green' });
await service.addBlocker(task.taskId, { text: 'waiting on review' });
await service.addNote(task.taskId, 'designing now');
await service.close(task.taskId, 'completed');

const events = await service.getEvents(task.taskId);
```

## Service API

All methods async. Every mutator accepts `opts?: { actor?: Actor }` (auto-resolved if
omitted) and returns the updated `Task` (or `{ task, blockerId/evidenceId/artifactId }`).

`create`, `get`, `resolveTask(ref)`, `list(filter?)`, `update`, `setPhase`, `setStatus`,
`setProgress`, `setNextStep`, `addBlocker`, `resolveBlocker`, `addEvidence`, `addArtifact`,
`setAttribution`, `addNote`, `close`, low-level `addEvent`, `getEvents`.

`resolveTask` accepts a full id, a unique id prefix, or a feature key (latest non-terminal
task).

## Plugin CLI

Install and enable the package as an AI DevKit plugin before using the command:

```bash
ai-devkit plugin add @ai-devkit/task-manager
```

`ai-devkit task ...` — create, list, show, update, phase, status, progress, next,
blocker `<id> add <text>|resolve <blockerId>`, evidence, artifact, assign, note, event,
close. The plugin resolves `.ai-devkit.json` `tasks.path` when present. Global flags:
`--db-path`, `--json`, `--agent`, `--agent-type`, `--pid`, `--session`.
See the design doc for the full verb/flag table.

```bash
ai-devkit task create --title "Ship feature X" --feature feature-x --phase requirements --json
ai-devkit task phase feature-x design                 # resolves by feature key
ai-devkit task evidence feature-x --command "nx test" --exit-code 0 --passed --summary "all green"
ai-devkit task show feature-x --events
```

## Event types (closed set)

`task.created`, `task.updated`, `task.phase.set`, `task.status.set`, `task.progress.set`,
`task.next_step.set`, `task.blocker.add`, `task.blocker.resolve`, `task.evidence.add`,
`task.artifact.add`, `task.attribution.set`, `task.note.append` (event-only),
`task.custom` (event-only escape hatch), `task.closed`.

## Attribution

Per-event `actor` records who **emitted** an event; `task.attribution` records the **current
owner**. When `actor` is omitted the service auto-resolves from explicit opts, env
(`AI_DEVKIT_AGENT_ID/TYPE/SESSION_ID/PID`), and `process.pid`.

## Limitations (MVP)

- `createTaskService` / `TaskRepository` use the process-wide `getDatabase()` singleton
  connection; long-running callers that need to release it should call `closeDatabase()`.
- Snapshot is authoritative; event-sourced replay is a documented future capability.
- No project management (boards/milestones/hierarchies/permissions).
