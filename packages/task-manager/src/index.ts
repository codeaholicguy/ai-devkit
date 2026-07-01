/**
 * @ai-devkit/task-manager
 *
 * Durable task system: stable task ids, artifacts, evidence, progress, blockers,
 * lifecycle phase, agent attribution, and an append-only event history.
 *
 * Contract surface. Consumers (CLI, skills, the tracing worker port) import types
 * and the TaskService from this package. Storage is pluggable via the TaskStore SPI;
 * callers never touch storage directly.
 *
 * Contract of record: docs/ai/design/2026-07-01-feature-task-system.md (+ .CONTRACT.md).
 */

// Types (LOCKED names/fields).
export type {
    Actor,
    LifecyclePhase,
    TaskStatus,
    TaskProgress,
    TaskLinks,
    TaskBlocker,
    TaskEvidence,
    TaskArtifact,
    Task,
    TaskEvent,
    TaskEventType,
    TaskCreatedPayload,
    TaskUpdatedPayload,
    TaskPhaseSetPayload,
    TaskStatusSetPayload,
    TaskProgressSetPayload,
    TaskNextStepSetPayload,
    TaskBlockerAddPayload,
    TaskBlockerResolvePayload,
    TaskEvidenceAddPayload,
    TaskArtifactAddPayload,
    TaskAttributionSetPayload,
    TaskNoteAppendPayload,
    TaskCustomPayload,
    TaskClosedPayload,
} from './types/index.js';

// Storage SPI + SQLite-backed implementation.
export { SqliteTaskStore } from './store/sqlite-store.js';
export type { TaskStore } from './store/types.js';
export { DatabaseConnection, resolveDbPath, DEFAULT_DB_PATH } from './database/connection.js';
export type { DatabaseOptions } from './database/connection.js';

// Service (consume-only surface).
export { TaskService } from './service.js';
export type {
    TaskMutationOptions,
    TaskCreateInput,
    TaskUpdatePatch,
    TaskListFilter,
    TaskEventsFilter,
    TaskRef,
} from './service.js';

// Errors.
export {
    TaskError,
    TaskNotFoundError,
    TaskValidationError,
    AmbiguousTaskRefError,
    TaskResourceNotFoundError,
    TaskStoreError,
    UnknownEventTypeError,
    isTaskEventType,
} from './errors.js';

// Attribution helpers.
export { resolveCurrentActor, ATTRIB_ENV } from './actor-resolver.js';
export type { ActorResolver } from './actor-resolver.js';

// Id helpers (for tests / advanced consumers).
export {
    makeTaskId,
    makeEventId,
    makeBlockerId,
    makeEvidenceId,
    makeArtifactId,
    nowIso,
} from './ids.js';

/**
 * Convenience factory: a TaskService backed by the default SqliteTaskStore at the
 * resolved DB path (dbPath arg > AIDEVKIT_TASKS_DB > ~/.ai-devkit/tasks.db).
 */
import { SqliteTaskStore } from './store/sqlite-store.js';
import { resolveDbPath } from './database/connection.js';
import { TaskService } from './service.js';

export function createTaskService(dbPath?: string): TaskService {
    return new TaskService(new SqliteTaskStore(dbPath));
}
