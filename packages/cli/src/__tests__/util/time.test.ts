
import { formatLocalDate, parseMilliseconds } from '../../util/time.js';

describe('time util', () => {
    describe('formatLocalDate', () => {
        it('formats local dates as YYYY-MM-DD with zero-padded month and day', () => {
            expect(formatLocalDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
            expect(formatLocalDate(new Date(2026, 10, 15, 0, 30))).toBe('2026-11-15');
        });
    });

    describe('parseMilliseconds', () => {
        it('returns the default when the value is omitted', () => {
            expect(parseMilliseconds(undefined, 600000)).toEqual({ milliseconds: 600000 });
        });

        it('parses positive integer milliseconds and adds an ms label', () => {
            expect(parseMilliseconds('1500', 600000)).toEqual({
                milliseconds: 1500,
                label: '1500ms',
            });
        });

        it('trims surrounding whitespace', () => {
            expect(parseMilliseconds(' 30000 ', 600000)).toEqual({
                milliseconds: 30000,
                label: '30000ms',
            });
        });

        it('rejects zero, decimals, units, and non-numeric values', () => {
            const invalidValues = ['0', '1.5', '1.5s', '30s', 'soon', '-1', ''];

            for (const value of invalidValues) {
                expect(() => parseMilliseconds(value, 600000)).toThrow(
                    'Expected positive integer milliseconds.',
                );
            }
        });
    });
});
