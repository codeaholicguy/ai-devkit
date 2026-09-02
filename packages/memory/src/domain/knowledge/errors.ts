export class KnowledgeMemoryError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'KnowledgeMemoryError';
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

export class ValidationError extends KnowledgeMemoryError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'VALIDATION_ERROR', details);
        this.name = 'ValidationError';
    }
}

export class DuplicateError extends KnowledgeMemoryError {
    constructor(
        message: string,
        public readonly existingId: string,
        public readonly duplicateType: 'title' | 'content'
    ) {
        super(message, 'DUPLICATE_ERROR', { existingId, duplicateType });
        this.name = 'DuplicateError';
    }
}

export class StorageError extends KnowledgeMemoryError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'STORAGE_ERROR', details);
        this.name = 'StorageError';
    }
}

export class NotFoundError extends KnowledgeMemoryError {
    constructor(message: string, id?: string) {
        super(message, 'NOT_FOUND_ERROR', id ? { id } : undefined);
        this.name = 'NotFoundError';
    }
}