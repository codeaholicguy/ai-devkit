# Tracing Integration — Design Intent (BLOCKED on task contract)

> Status: **WAITING** on the finalized Task/TaskEvent contract from `task-system-feature`.
> Worktree: `feature-tracing-integration`. Agent: `agent-session-tracing`.

## Scope

dev-lifecycle / structured-debug progress tracing that attaches **phase, current
progress, next step, blockers, validation evidence, and agent attribution** to a
TASK. Task is the durable unit; tracing = task progress/events. **No separate
session-trace model, no duplicated task storage.** Tracing consumes the task
service/CLI.

## Hard gate

Cannot finalize design or write integration code until `task-system-feature`
publishes the Task/TaskEvent contract. Requested: Task schema fields, TaskEvent
type vocabulary + payload shapes, service API surface, CLI command contract,
evidence/artifact model, attribution model, feature↔task↔phase mapping, storage
path confirmation.

## Design decisions to execute once unblocked

- Tracing writes only **task updates/events** via the task service — never touches
  `~/.ai-devkit/tasks/<id>/` storage directly.
- Two integration surfaces:
  1. **Emit** — `dev-lifecycle` (phase transitions), `dev-planning`/`dev-implementation`
     (progress), `verify`/`tdd`/`dev-testing` (validation evidence), any phase (blockers/next-step).
  2. **Read** — orchestrator/parent agents read task status to route work and hand off.
- MVP scope: dev-lifecycle + verify emit + read. structured-debug reuses generic
  event types (no debug-specific vocab in MVP).
- Agent attribution follows whatever the contract specifies; prefer auto-resolution
  of the calling agent over manual `--agent`.

## Open questions for the contract (blocking)

See the request sent to `task-system-feature`. Key unknowns: whether phase is a
first-class task field vs. derived; whether 1 task = 1 phase or 1 task = 1 feature
with phase as a field; exact event-type strings.
