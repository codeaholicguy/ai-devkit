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
} from './task.types.js';

export { TaskRepository } from './task.repository.js';
export {
    DatabaseConnection,
    getDatabase,
    closeDatabase,
    resolveDbPath,
    DEFAULT_DB_PATH,
} from './database/connection.js';
export type { DatabaseOptions } from './database/connection.js';

export { TaskService } from './task.service.js';
export type {
    TaskMutationOptions,
    TaskCreateInput,
    TaskUpdatePatch,
    TaskListFilter,
    TaskEventsFilter,
    TaskRef,
} from './task.service.js';

export {
    TaskError,
    TaskNotFoundError,
    TaskValidationError,
    AmbiguousTaskRefError,
    TaskResourceNotFoundError,
    TaskRepositoryError,
    UnknownEventTypeError,
    isTaskEventType,
} from './task.errors.js';

/**
 * Convenience factory: a TaskService backed by a TaskRepository at the resolved
 * DB path (dbPath arg > ~/.ai-devkit/tasks.db).
 */
import { TaskRepository } from './task.repository.js';
import { TaskService } from './task.service.js';
import { resolveDbPath } from './database/connection.js';

export function createTaskService(dbPath?: string): TaskService {
    return new TaskService(new TaskRepository(resolveDbPath(dbPath)));
}
