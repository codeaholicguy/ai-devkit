
import { getErrorMessage, truncate } from '../../util/text.js';

describe('text util', () => {
    describe('getErrorMessage', () => {
        it('returns Error messages', () => {
            expect(getErrorMessage(new Error('memory failed'))).toBe('memory failed');
        });

        it('stringifies non-Error values', () => {
            expect(getErrorMessage('plain failure')).toBe('plain failure');
            expect(getErrorMessage(404)).toBe('404');
        });
    });

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
