import {
    DuplicateError,
    KnowledgeMemoryError,
    NotFoundError,
    StorageError,
    ValidationError,
} from '../../../../src/domain/knowledge/errors';

describe('knowledge memory errors', () => {
    it('serializes base errors with code, message, and details', () => {
        const error = new KnowledgeMemoryError('Base failure', 'BASE_FAILURE', { id: 'memory-1' });

        expect(error.toJSON()).toEqual({
            error: 'BASE_FAILURE',
            message: 'Base failure',
            details: { id: 'memory-1' },
        });
    });

    it('keeps subclass codes and details stable', () => {
        expect(new ValidationError('Invalid input', { errors: ['bad'] }).toJSON()).toEqual({
            error: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: { errors: ['bad'] },
        });

        expect(new DuplicateError('Duplicate title', 'existing-1', 'title').toJSON()).toEqual({
            error: 'DUPLICATE_ERROR',
            message: 'Duplicate title',
            details: { existingId: 'existing-1', duplicateType: 'title' },
        });

        expect(new StorageError('Write failed', { originalError: 'locked' }).toJSON()).toEqual({
            error: 'STORAGE_ERROR',
            message: 'Write failed',
            details: { originalError: 'locked' },
        });

        expect(new NotFoundError('Missing item', 'missing-1').toJSON()).toEqual({
            error: 'NOT_FOUND_ERROR',
            message: 'Missing item',
            details: { id: 'missing-1' },
        });
    });
});
