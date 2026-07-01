/**
 * @ai-devkit/task-tracer — tracing layer for the ai-devkit Task contract.
 *
 * Maps dev-lifecycle / structured-debug progress semantics onto the LOCKED Task
 * contract. Task is the durable unit; tracing = task progress/events. Owns no
 * storage; consumes a `TaskService` (port) only.
 */

export type {
    Actor,
    TaskBlocker,
    TaskEvidence,
    TaskArtifact,
    TaskLinks,
    Task,
    TaskStatus,
    TaskProgress,
    TaskEvent,
    TaskEventType,
    TaskRef,
    CreateTaskInput,
    UpdateTaskInput,
    ListFilter,
    ProgressInput,
    AddBlockerInput,
    AddEvidenceInput,
    AddArtifactInput,
    MutatorOptions,
    AddBlockerResult,
    AddEvidenceResult,
    AddArtifactResult,
    EventFilter,
    ITaskService,
} from './contract.js';
export { TASK_EVENT_TYPES, TaskNotFoundError, AmbiguousTaskPrefixError } from './contract.js';

export { TaskTracer } from './TaskTracer.js';
export type {
    EnsureFeatureTaskInput,
    EnsureFeatureTaskResult,
    ValidationInput,
    CustomObservation,
} from './TaskTracer.js';

export { readStatus, digest } from './status.js';
export type {
    StatusDigest,
    OpenBlockerDigest,
    LastValidationDigest,
    ReadStatusOptions,
} from './status.js';

export { resolveActor, readActorEnv } from './ActorResolver.js';
export type { ActorEnv } from './ActorResolver.js';

export {
    buildCreateArgv,
    buildShowArgv,
    buildListArgv,
    buildPhaseArgv,
    buildStatusArgv,
    buildProgressArgv,
    buildNextArgv,
    buildBlockerAddArgv,
    buildBlockerResolveArgv,
    buildEvidenceArgv,
    buildArtifactArgv,
    buildAssignArgv,
    buildNoteArgv,
    buildEventArgv,
    buildCloseArgv,
} from './cli-argv.js';
export type { GlobalFlags } from './cli-argv.js';

// Test double (NOT shipped storage). Re-exported for consumers that want a
// faithful in-memory TaskService before @ai-devkit/task-manager lands.
export { InMemoryTaskService } from './in-memory.js';
