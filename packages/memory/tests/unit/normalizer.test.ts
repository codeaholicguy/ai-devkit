import {
    normalizeTitle,
    normalizeContent,
    hashContent,
    normalizeTags,
    normalizeScope,
} from '../../src/services/normalizer';

describe('normalizer', () => {
    describe('normalizeTitle', () => {
        it('should lowercase the title', () => {
            expect(normalizeTitle('Use Response DTOs')).toBe('use response dtos');
        });

        it('should trim whitespace', () => {
            expect(normalizeTitle('  spaced title  ')).toBe('spaced title');
        });

        it('should collapse multiple spaces', () => {
            expect(normalizeTitle('multiple   spaces   here')).toBe('multiple spaces here');
        });

        it('should handle all transformations together', () => {
            expect(normalizeTitle('  Use  Response  DTOs  ')).toBe('use response dtos');
        });
    });

    describe('normalizeContent', () => {
        it('should trim content', () => {
            expect(normalizeContent('  content  ')).toBe('content');
        });

        it('should normalize CRLF to LF', () => {
            expect(normalizeContent('line1\r\nline2')).toBe('line1\nline2');
        });

        it('should normalize CR to LF', () => {
            expect(normalizeContent('line1\rline2')).toBe('line1\nline2');
        });

        it('should collapse multiple blank lines', () => {
            expect(normalizeContent('para1\n\n\n\npara2')).toBe('para1\n\npara2');
        });
    });

    describe('hashContent', () => {
        it('should return consistent SHA-256 hash', () => {
            const hash1 = hashContent('test content');
            const hash2 = hashContent('test content');
            expect(hash1).toBe(hash2);
        });

        it('should return 64 character hex string', () => {
            const hash = hashContent('test');
            expect(hash).toMatch(/^[a-f0-9]{64}$/);
        });

        it('should normalize before hashing', () => {
            const hash1 = hashContent('  test  ');
            const hash2 = hashContent('test');
            expect(hash1).toBe(hash2);
        });

        it('should produce different hashes for different content', () => {
            const hash1 = hashContent('content a');
            const hash2 = hashContent('content b');
            expect(hash1).not.toBe(hash2);
        });
    });

    describe('normalizeTags', () => {
        it('should lowercase tags', () => {
            expect(normalizeTags(['API', 'Backend'])).toEqual(['api', 'backend']);
        });

        it('should trim whitespace', () => {
            expect(normalizeTags(['  api  ', 'backend'])).toEqual(['api', 'backend']);
        });

        it('should remove duplicates', () => {
            expect(normalizeTags(['api', 'API', 'Api'])).toEqual(['api']);
        });

        it('should filter empty strings', () => {
            expect(normalizeTags(['api', '', '  '])).toEqual(['api']);
        });

        it('should handle empty array', () => {
            expect(normalizeTags([])).toEqual([]);
        });
    });

    describe('normalizeScope', () => {
        it('should return global for undefined', () => {
            expect(normalizeScope(undefined)).toBe('global');
        });

        it('should return global for empty string', () => {
            expect(normalizeScope('')).toBe('global');
            expect(normalizeScope('   ')).toBe('global');
        });

        it('should lowercase scope', () => {
            expect(normalizeScope('Project:MyApp')).toBe('project:myapp');
        });

        it('should trim scope', () => {
            expect(normalizeScope('  global  ')).toBe('global');
        });
    });
});
