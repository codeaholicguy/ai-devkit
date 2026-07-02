import { describe, it, expect } from 'vitest';
import {
    TaskError,
    TaskNotFoundError,
    TaskValidationError,
    AmbiguousTaskRefError,
    TaskResourceNotFoundError,
    TaskRepositoryError,
    UnknownEventTypeError,
    isTaskEventType,
} from '../../src/task.errors.js';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TASK_ID = '22222222-2222-4222-8222-222222222222';
const BLOCKER_ID = '33333333-3333-4333-8333-333333333333';

describe('errors', () => {
    it('TaskNotFoundError carries taskId and code', () => {
        const err = new TaskNotFoundError(TASK_ID);
        expect(err.code).toBe('TASK_NOT_FOUND');
        expect(err.details).toEqual({ taskId: TASK_ID });
        expect(err.toJSON()).toHaveProperty('error', 'TASK_NOT_FOUND');
    });

    it('AmbiguousTaskRefError lists matches', () => {
        const err = new AmbiguousTaskRefError('11111111', [TASK_ID, OTHER_TASK_ID]);
        expect(err.code).toBe('AMBIGUOUS_TASK_REF');
        expect(err.details).toEqual({ ref: '11111111', matches: [TASK_ID, OTHER_TASK_ID] });
    });

    it('TaskResourceNotFoundError names kind and id', () => {
        const err = new TaskResourceNotFoundError(TASK_ID, 'Blocker', BLOCKER_ID);
        expect(err.code).toBe('TASK_RESOURCE_NOT_FOUND');
        expect(err.message).toContain('Blocker');
    });

    it('TaskValidationError has VALIDATION_ERROR code', () => {
        const err = new TaskValidationError('bad input');
        expect(err.code).toBe('TASK_VALIDATION_ERROR');
    });

    it('TaskRepositoryError has TASK_REPOSITORY_ERROR code', () => {
        const err = new TaskRepositoryError('disk full');
        expect(err.code).toBe('TASK_REPOSITORY_ERROR');
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
            new TaskRepositoryError('x'),
            new UnknownEventTypeError('x'),
        ]) {
            expect(err).toBeInstanceOf(TaskError);
            expect(err.toJSON()).toHaveProperty('message');
        }
    });
});
