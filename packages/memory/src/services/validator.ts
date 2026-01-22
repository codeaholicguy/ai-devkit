import { ValidationError } from '../utils/errors';
import type { StoreKnowledgeInput } from '../types';

const TITLE_MIN_LENGTH = 10;
const TITLE_MAX_LENGTH = 100;
const CONTENT_MIN_LENGTH = 50;
const CONTENT_MAX_LENGTH = 5000;
const TAGS_MAX_COUNT = 10;

const SCOPE_PATTERN = /^(global|project:[a-z0-9_-]+|repo:[a-z0-9_-]+)$/i;
const TAG_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;

const GENERIC_PHRASES = [
    'this is important',
    'remember this',
    'note to self',
    'todo',
    'fix this',
    'do this',
    'always do',
    'never do',
];

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export function validateTitle(title: string): ValidationResult {
    const errors: string[] = [];

    if (!title || title.trim().length === 0) {
        errors.push('Title is required');
    } else {
        const trimmed = title.trim();
        if (trimmed.length < TITLE_MIN_LENGTH) {
            errors.push(`Title must be at least ${TITLE_MIN_LENGTH} characters`);
        }
        if (trimmed.length > TITLE_MAX_LENGTH) {
            errors.push(`Title must be at most ${TITLE_MAX_LENGTH} characters`);
        }
    }

    return { valid: errors.length === 0, errors };
}

export function validateContent(content: string): ValidationResult {
    const errors: string[] = [];

    if (!content || content.trim().length === 0) {
        errors.push('Content is required');
    } else {
        const trimmed = content.trim();
        if (trimmed.length < CONTENT_MIN_LENGTH) {
            errors.push(`Content must be at least ${CONTENT_MIN_LENGTH} characters`);
        }
        if (trimmed.length > CONTENT_MAX_LENGTH) {
            errors.push(`Content must be at most ${CONTENT_MAX_LENGTH} characters`);
        }

        // Check for generic/low-quality content
        const lowerContent = trimmed.toLowerCase();
        for (const phrase of GENERIC_PHRASES) {
            if (lowerContent === phrase || lowerContent.startsWith(phrase + ' ')) {
                errors.push('Content appears too generic. Please provide specific, actionable knowledge.');
                break;
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

export function validateTags(tags?: string[]): ValidationResult {
    const errors: string[] = [];

    if (!tags || tags.length === 0) {
        return { valid: true, errors: [] };
    }

    if (tags.length > TAGS_MAX_COUNT) {
        errors.push(`Maximum ${TAGS_MAX_COUNT} tags allowed`);
    }

    for (const tag of tags) {
        if (!TAG_PATTERN.test(tag)) {
            errors.push(`Invalid tag "${tag}". Tags must be alphanumeric with hyphens.`);
        }
    }

    return { valid: errors.length === 0, errors };
}

export function validateScope(scope?: string): ValidationResult {
    const errors: string[] = [];

    if (!scope || scope === 'global') {
        return { valid: true, errors: [] };
    }

    if (!SCOPE_PATTERN.test(scope)) {
        errors.push('Invalid scope. Must be "global", "project:<name>", or "repo:<name>"');
    }

    return { valid: errors.length === 0, errors };
}

export function validateStoreInput(input: StoreKnowledgeInput): void {
    const allErrors: string[] = [];

    const titleResult = validateTitle(input.title);
    allErrors.push(...titleResult.errors);

    const contentResult = validateContent(input.content);
    allErrors.push(...contentResult.errors);

    const tagsResult = validateTags(input.tags);
    allErrors.push(...tagsResult.errors);

    const scopeResult = validateScope(input.scope);
    allErrors.push(...scopeResult.errors);

    if (allErrors.length > 0) {
        throw new ValidationError(allErrors.join('; '), { errors: allErrors });
    }
}
