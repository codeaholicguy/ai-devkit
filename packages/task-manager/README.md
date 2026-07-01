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
`@ai-devkit/memory`). Task id format: `task-<YYYYMMDDHHMMSS>-<6 base36>` (sortable by
creation, collision-safe). Override the DB path with `--store`, `AIDEVKIT_TASKS_DB`, or
the `SqliteTaskStore` / `DatabaseConnection` constructor. Storage is pluggable behind the
`TaskStore` SPI.

## Quick start

```ts
import { createTaskService } from '@ai-devkit/task-manager';

const service = createTaskService(); // ~/.ai-devkit/tasks

const task = await service.create({ title: 'Ship feature X', feature: 'feature-x', phase: 'requirements' });

await service.setPhase(task.taskId, 'design');
await service.setProgress(task.taskId, { text: 'halfway', percent: 50 });
await service.addEvidence(task.taskId, { command: 'nx test', exitCode: 0, passed: true, summary: 'all green' });
await service.addBlocker(task.taskId, { text: 'waiting on review' });
await service.addNote(task.taskId, 'designing now');
await service.close(task.taskId, 'completed');

const events = await service.getEvents(task.taskId);
```

## Service API (consume-only; never touch storage)

All methods async. Every mutator accepts `opts?: { actor?: Actor }` (auto-resolved if
omitted) and returns the updated `Task` (or `{ task, blockerId/evidenceId/artifactId }`).

`create`, `get`, `resolveTask(ref)`, `list(filter?)`, `update`, `setPhase`, `setStatus`,
`setProgress`, `setNextStep`, `addBlocker`, `resolveBlocker`, `addEvidence`, `addArtifact`,
`setAttribution`, `addNote`, `close`, low-level `addEvent`, `getEvents`.

`resolveTask` accepts a full id, a unique id prefix, or a feature key (latest non-terminal
task).

## CLI

`ai-devkit task ...` — create, list, show, update, phase, status, progress, next,
blocker `<id> add <text>|resolve <blockerId>`, evidence, artifact, assign, note, event,
close. Global flags: `--store`, `--json`, `--agent`, `--agent-type`, `--pid`, `--session`.
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
owner**. When `actor` is omitted the service auto-resolves from explicit opts → env
(`AIDEVKIT_AGENT_ID/TYPE/SESSION_ID/PID`) → `process.pid` → `null`.

## Limitations (MVP)

- `createTaskService` opens a connection that lives for the process; long-running callers
  that need to release it should construct `SqliteTaskStore` directly and call `close()`.
- Snapshot is authoritative; event-sourced replay is a documented future capability.
- No project management (boards/milestones/hierarchies/permissions).
