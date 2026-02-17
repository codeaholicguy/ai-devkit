import {
    validateTitle,
    validateContent,
    validateTags,
    validateScope,
    validateStoreInput,
    validateUpdateInput,
} from '../../src/services/validator';
import { ValidationError } from '../../src/utils/errors';

describe('validator', () => {
    describe('validateTitle', () => {
        it('should accept valid title', () => {
            const result = validateTitle('Use Response DTOs for APIs');
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('should reject empty title', () => {
            const result = validateTitle('');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Title is required');
        });

        it('should reject title shorter than 10 chars', () => {
            const result = validateTitle('Short');
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('at least 10');
        });

        it('should reject title longer than 100 chars', () => {
            const longTitle = 'a'.repeat(101);
            const result = validateTitle(longTitle);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('at most 100');
        });
    });

    describe('validateContent', () => {
        const validContent = 'This is valid content that is at least fifty characters long for testing purposes.';

        it('should accept valid content', () => {
            const result = validateContent(validContent);
            expect(result.valid).toBe(true);
        });

        it('should reject empty content', () => {
            const result = validateContent('');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Content is required');
        });

        it('should reject content shorter than 50 chars', () => {
            const result = validateContent('Too short');
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('at least 50');
        });

        it('should reject content longer than 5000 chars', () => {
            const longContent = 'a'.repeat(5001);
            const result = validateContent(longContent);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('at most 5000');
        });

        it('should reject generic phrases', () => {
            const result = validateContent('this is important please remember this content here');
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('generic');
        });
    });

    describe('validateTags', () => {
        it('should accept valid tags', () => {
            const result = validateTags(['api', 'backend', 'rest']);
            expect(result.valid).toBe(true);
        });

        it('should accept empty tags array', () => {
            const result = validateTags([]);
            expect(result.valid).toBe(true);
        });

        it('should accept undefined tags', () => {
            const result = validateTags(undefined);
            expect(result.valid).toBe(true);
        });

        it('should reject more than 10 tags', () => {
            const tooManyTags = Array(11).fill('tag').map((t, i) => `${t}${i}`);
            const result = validateTags(tooManyTags);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Maximum 10');
        });

        it('should reject invalid tag format', () => {
            const result = validateTags(['valid', 'invalid tag', '123valid']);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Invalid tag');
        });
    });

    describe('validateScope', () => {
        it('should accept global scope', () => {
            const result = validateScope('global');
            expect(result.valid).toBe(true);
        });

        it('should accept undefined (defaults to global)', () => {
            const result = validateScope(undefined);
            expect(result.valid).toBe(true);
        });

        it('should accept valid project scope', () => {
            const result = validateScope('project:my-app');
            expect(result.valid).toBe(true);
        });

        it('should accept valid repo scope', () => {
            const result = validateScope('repo:my-repo');
            expect(result.valid).toBe(true);
        });

        it('should reject invalid scope format', () => {
            const result = validateScope('invalid-scope');
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Invalid scope');
        });
    });

    describe('validateUpdateInput', () => {
        it('should not throw for valid input with title', () => {
            expect(() => validateUpdateInput({
                id: 'some-valid-uuid',
                title: 'A valid updated title here',
            })).not.toThrow();
        });

        it('should not throw for valid input with content', () => {
            expect(() => validateUpdateInput({
                id: 'some-valid-uuid',
                content: 'Valid content that is long enough to pass the minimum content length validation requirement.',
            })).not.toThrow();
        });

        it('should not throw for valid input with tags', () => {
            expect(() => validateUpdateInput({
                id: 'some-valid-uuid',
                tags: ['api', 'backend'],
            })).not.toThrow();
        });

        it('should not throw for valid input with scope', () => {
            expect(() => validateUpdateInput({
                id: 'some-valid-uuid',
                scope: 'project:my-app',
            })).not.toThrow();
        });

        it('should throw ValidationError when id is missing', () => {
            expect(() => validateUpdateInput({
                id: '',
                title: 'A valid updated title here',
            })).toThrow(ValidationError);
        });

        it('should throw ValidationError when no update fields provided', () => {
            expect(() => validateUpdateInput({
                id: 'some-valid-uuid',
            })).toThrow(ValidationError);
        });

        it('should validate only provided fields and skip absent ones', () => {
            // title too short but content not provided — should only report title error
            try {
                validateUpdateInput({ id: 'some-uuid', title: 'Short' });
            } catch (error) {
                expect(error).toBeInstanceOf(ValidationError);
                expect((error as ValidationError).message).toContain('Title');
                expect((error as ValidationError).message).not.toContain('Content');
            }
        });

        it('should throw ValidationError for invalid title', () => {
            expect(() => validateUpdateInput({
                id: 'some-valid-uuid',
                title: 'Short',
            })).toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid content', () => {
            expect(() => validateUpdateInput({
                id: 'some-valid-uuid',
                content: 'Too short',
            })).toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid tags', () => {
            expect(() => validateUpdateInput({
                id: 'some-valid-uuid',
                tags: ['invalid tag with spaces'],
            })).toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid scope', () => {
            expect(() => validateUpdateInput({
                id: 'some-valid-uuid',
                scope: 'bad-scope',
            })).toThrow(ValidationError);
        });
    });

    describe('validateStoreInput', () => {
        const validInput = {
            title: 'Always use Response DTOs for APIs',
            content: 'When building REST APIs, always use Response DTOs instead of returning domain entities directly. This provides better API versioning and security.',
            tags: ['api', 'backend'],
            scope: 'global',
        };

        it('should not throw for valid input', () => {
            expect(() => validateStoreInput(validInput)).not.toThrow();
        });

        it('should throw ValidationError for invalid input', () => {
            const invalidInput = { title: 'x', content: 'y' };
            expect(() => validateStoreInput(invalidInput)).toThrow(ValidationError);
        });

        it('should include all errors in message', () => {
            const invalidInput = { title: 'x', content: 'y' };
            try {
                validateStoreInput(invalidInput);
            } catch (error) {
                expect(error).toBeInstanceOf(ValidationError);
                expect((error as ValidationError).message).toContain('Title');
                expect((error as ValidationError).message).toContain('Content');
            }
        });
    });
});
