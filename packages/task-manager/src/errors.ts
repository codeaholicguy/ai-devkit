import type { TaskEventType } from './types/index.js';

/**
 * Base error for the task system. Typed error codes enable programmatic handling.
 */
export class TaskError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'TaskError';
        Object.setPrototypeOf(this, new.target.prototype);
    }

    toJSON(): Record<string, unknown> {
        return {
            error: this.code,
            message: this.message,
            details: this.details,
        };
    }
}

/** Thrown when a referenced task id does not exist. */
export class TaskNotFoundError extends TaskError {
    constructor(taskId: string) {
        super(`Task not found: ${taskId}`, 'TASK_NOT_FOUND', { taskId });
        this.name = 'TaskNotFoundError';
    }
}

/** Thrown when user input or a task field fails validation. */
export class TaskValidationError extends TaskError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'TASK_VALIDATION_ERROR', details);
        this.name = 'TaskValidationError';
    }
}

/** Thrown when a task reference resolves to multiple candidates (e.g. ambiguous prefix). */
export class AmbiguousTaskRefError extends TaskError {
    constructor(ref: string, matches: string[]) {
        super(
            `Ambiguous task reference "${ref}" matches ${matches.length} tasks: ${matches.join(', ')}`,
            'AMBIGUOUS_TASK_REF',
            { ref, matches }
        );
        this.name = 'AmbiguousTaskRefError';
    }
}

/** Thrown when a referenced sub-resource (blocker, artifact) does not exist on a task. */
export class TaskResourceNotFoundError extends TaskError {
    constructor(taskId: string, kind: string, id: string) {
        super(`${kind} "${id}" not found on task ${taskId}`, 'TASK_RESOURCE_NOT_FOUND', { taskId, kind, id });
        this.name = 'TaskResourceNotFoundError';
    }
}

/** Thrown when the underlying storage layer fails. */
export class TaskStoreError extends TaskError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'TASK_STORE_ERROR', details);
        this.name = 'TaskStoreError';
    }
}

/** Thrown when an event type is not part of the closed set or cannot mutate a snapshot. */
export class UnknownEventTypeError extends TaskError {
    constructor(type: string) {
        super(`Unknown task event type: ${type}`, 'UNKNOWN_EVENT_TYPE', { type });
        this.name = 'UnknownEventTypeError';
    }
}

/** Type guard for the closed TaskEventType union. */
export function isTaskEventType(type: string): type is TaskEventType {
    return [
        'task.created',
        'task.updated',
        'task.phase.set',
        'task.status.set',
        'task.progress.set',
        'task.next_step.set',
        'task.blocker.add',
        'task.blocker.resolve',
        'task.evidence.add',
        'task.artifact.add',
        'task.attribution.set',
        'task.note.append',
        'task.custom',
        'task.closed',
    ].includes(type);
}
