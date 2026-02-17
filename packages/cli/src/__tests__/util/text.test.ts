import { describe, it, expect } from '@jest/globals';
import { truncate } from '../../util/text';

describe('text util', () => {
    describe('truncate', () => {
        it('returns original text when it is within maxLength', () => {
            expect(truncate('hello', 10)).toBe('hello');
        });

        it('truncates text and appends replaceText', () => {
            expect(truncate('abcdefghijklmnopqrstuvwxyz', 10, '...')).toBe('abcdefg...');
        });

        it('returns empty string when maxLength is 0 or less', () => {
            expect(truncate('hello', 0)).toBe('');
            expect(truncate('hello', -1)).toBe('');
        });

        it('truncates replaceText itself when replaceText is longer than maxLength', () => {
            expect(truncate('hello world', 2, '...')).toBe('..');
        });
    });
});
