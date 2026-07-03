import { describe, expect, it } from 'vitest';
import { deepEqual } from '../../util/object.js';

describe('deepEqual', () => {
    it('compares primitive, array, and object values', () => {
        expect(deepEqual('x', 'x')).toBe(true);
        expect(deepEqual('x', 1)).toBe(false);
        expect(deepEqual(null, {})).toBe(false);
        expect(deepEqual(['a', { b: 1 }], ['a', { b: 1 }])).toBe(true);
        expect(deepEqual(['a'], ['a', 'b'])).toBe(false);
        expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
        expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
    });
});
