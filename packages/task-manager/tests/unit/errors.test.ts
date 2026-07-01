import { describe, it, expect } from 'vitest';
import {
    TaskError,
    TaskNotFoundError,
    TaskValidationError,
    AmbiguousTaskRefError,
    TaskResourceNotFoundError,
    TaskStoreError,
    UnknownEventTypeError,
    isTaskEventType,
} from '../../src/errors.js';

describe('errors', () => {
    it('TaskNotFoundError carries taskId and code', () => {
        const err = new TaskNotFoundError('task-123');
        expect(err.code).toBe('TASK_NOT_FOUND');
        expect(err.details).toEqual({ taskId: 'task-123' });
        expect(err.toJSON()).toHaveProperty('error', 'TASK_NOT_FOUND');
    });

    it('AmbiguousTaskRefError lists matches', () => {
        const err = new AmbiguousTaskRefError('task-2026', ['task-2026a', 'task-2026b']);
        expect(err.code).toBe('AMBIGUOUS_TASK_REF');
        expect(err.details).toEqual({ ref: 'task-2026', matches: ['task-2026a', 'task-2026b'] });
    });

    it('TaskResourceNotFoundError names kind and id', () => {
        const err = new TaskResourceNotFoundError('task-1', 'Blocker', 'blk-1');
        expect(err.code).toBe('TASK_RESOURCE_NOT_FOUND');
        expect(err.message).toContain('Blocker');
    });

    it('TaskValidationError has VALIDATION_ERROR code', () => {
        const err = new TaskValidationError('bad input');
        expect(err.code).toBe('TASK_VALIDATION_ERROR');
    });

    it('TaskStoreError has TASK_STORE_ERROR code', () => {
        const err = new TaskStoreError('disk full');
        expect(err.code).toBe('TASK_STORE_ERROR');
    });

    it('UnknownEventTypeError rejects unknown types', () => {
        const err = new UnknownEventTypeError('task.bogus');
        expect(err.code).toBe('UNKNOWN_EVENT_TYPE');
    });

    it('isTaskEventType guards the closed union', () => {
        expect(isTaskEventType('task.created')).toBe(true);
        expect(isTaskEventType('task.custom')).toBe(true);
        expect(isTaskEventType('task.bogus')).toBe(false);
        expect(isTaskEventType('')).toBe(false);
    });

    it('all errors extend TaskError and support toJSON', () => {
        for (const err of [
            new TaskNotFoundError('x'),
            new TaskValidationError('x'),
            new AmbiguousTaskRefError('x', ['a']),
            new TaskResourceNotFoundError('x', 'Blocker', 'y'),
            new TaskStoreError('x'),
            new UnknownEventTypeError('x'),
        ]) {
            expect(err).toBeInstanceOf(TaskError);
            expect(err.toJSON()).toHaveProperty('message');
        }
    });
});
