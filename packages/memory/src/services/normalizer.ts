import { createHash } from 'crypto';

/**
 * Normalize title for deduplication
 */
export function normalizeTitle(title: string): string {
    return title
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * Normalize content for hashing
 */
export function normalizeContent(content: string): string {
    return content
        .trim()
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
}

/**
 * Generate SHA-256 hash of normalized content for deduplication
 */
export function hashContent(content: string): string {
    const normalized = normalizeContent(content);
    return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Normalize tags
 */
export function normalizeTags(tags: string[]): string[] {
    const normalized = tags
        .map(tag => tag.toLowerCase().trim())
        .filter(tag => tag.length > 0);

    return [...new Set(normalized)];
}

/**
 * Validate and normalize scope
 */
export function normalizeScope(scope?: string): string {
    if (!scope || scope.trim() === '') {
        return 'global';
    }
    return scope.trim().toLowerCase();
}