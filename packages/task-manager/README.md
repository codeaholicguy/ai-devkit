# @ai-devkit/task-manager

Durable task tracking for AI DevKit development and debugging work.

A task keeps the state an agent needs to resume work later: title, task name,
phase, progress, blockers, evidence, artifacts, owner attribution, linked branch
or PR, and an append-only event history.

## Quick Start

```ts
import { createTaskService } from '@ai-devkit/task-manager';

const service = createTaskService(); // Uses ~/.ai-devkit/tasks.db

const task = await service.create({
  title: 'Ship feature X',
  name: 'feature-x',
  phase: 'requirements',
});

await service.setPhase(task.taskId, 'design');
await service.setProgress(task.taskId, { text: 'implementation started' });
await service.addEvidence(task.taskId, {
  command: 'nx test',
  exitCode: 0,
  passed: true,
  summary: 'all green',
});
await service.close(task.taskId, 'completed');
```

## CLI

Install the package as an AI DevKit plugin:

```bash
ai-devkit plugin add @ai-devkit/task-manager
```

Then use `ai-devkit task`:

```bash
ai-devkit task create --title "Ship feature X" --name feature-x --phase requirements --json
ai-devkit task phase feature-x design
ai-devkit task progress feature-x --text "implementation started"
ai-devkit task evidence feature-x --command "nx test" --exit-code 0 --passed --summary "all green"
ai-devkit task show feature-x --events
```

Task references can be a full task id, a unique id prefix, or a task name. A
task name resolves to the latest non-terminal task with that name.

Common commands:

- `create`, `list`, `show`, `update`
- `phase`, `status`, `progress`, `next`
- `blocker <id> add <text>` and `blocker <id> resolve <blockerId>`
- `evidence`, `artifact`, `assign`, `note`, `event`, `close`

Global flags:

- `--db-path`
- `--json`
- `--agent`, `--agent-type`, `--pid`, `--session`

The CLI uses `.ai-devkit.json` `tasks.path` when present. `--db-path` overrides
that value.

## Service API

All methods are async. Mutators return the updated `Task`, except methods that
also create a child record return `{ task, blockerId }`, `{ task, evidenceId }`,
or `{ task, artifactId }`.

Every mutator accepts optional actor metadata:

```ts
{ actor?: Actor }
```

Available methods:

- `create`, `get`, `resolveTask`, `list`, `update`
- `setPhase`, `setStatus`, `setProgress`, `setNextStep`
- `addBlocker`, `resolveBlocker`
- `addEvidence`, `addArtifact`
- `setAttribution`, `addNote`, `close`
- `addEvent`, `getEvents`

## Storage

By default, tasks are stored in SQLite at:

```text
~/.ai-devkit/tasks.db
```

The database has two main tables:

- `tasks`: current task snapshots plus indexed query columns
- `task_events`: append-only history for each task

Library callers can choose a different database path by passing one to
`createTaskService`, `TaskRepository`, or `DatabaseConnection`.

## Events

Supported event types:

- `task.created`
- `task.updated`
- `task.phase.set`
- `task.status.set`
- `task.progress.set`
- `task.next_step.set`
- `task.blocker.add`
- `task.blocker.resolve`
- `task.evidence.add`
- `task.artifact.add`
- `task.attribution.set`
- `task.note.append`
- `task.custom`
- `task.closed`

Per-event `actor` records who emitted the event. `task.attribution` records the
current owner. If actor metadata is omitted, the event stores `null`.

## Notes

- Task and event ids are UUIDv4 strings from `crypto.randomUUID()`.
- SQLite uses `better-sqlite3` with WAL and `busy_timeout`.
- `createTaskService` and `TaskRepository` use the process-wide `getDatabase()`
  connection. Long-running callers that need to release it should call
  `closeDatabase()`.
- Task snapshots are authoritative. Event-sourced replay is planned but not
  implemented.
- Project-management features such as boards, milestones, hierarchies, and
  permissions are outside the current scope.
