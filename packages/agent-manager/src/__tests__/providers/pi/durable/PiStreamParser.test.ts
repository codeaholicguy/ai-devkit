import { describe, expect, it } from 'vitest';
import { PiStreamParser } from '../../../../providers/pi/durable/PiStreamParser.js';

const SESSION = '22222222-2222-4222-8222-222222222222';

describe('PiStreamParser', () => {
    it('ignores blank lines and normalizes unexpected parser failures', () => {
        const parser = new PiStreamParser(SESSION, 1024);
        parser.accept('\n');
        parser.fail(new Error('unexpected'));

        expect(parser.hasFailed()).toBe(true);
        expect(() => parser.result({ code: 0, signal: null }))
            .toThrowError(expect.objectContaining({ code: 'PI_PROTOCOL', message: 'Pi stream processing failed.' }));
    });

    it('includes the terminating signal in process failures', () => {
        const parser = new PiStreamParser(SESSION, 1024);
        parser.accept(`${JSON.stringify({ type: 'session', id: SESSION })}\n`);

        expect(() => parser.result({ code: null, signal: 'SIGTERM' }))
            .toThrowError(expect.objectContaining({ code: 'PI_PROCESS', message: 'Pi print run failed (SIGTERM)' }));
    });
});
