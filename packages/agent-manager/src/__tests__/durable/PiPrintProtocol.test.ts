import { describe, expect, it } from 'vitest';
import { buildPiPrintArgs, readPiAssistantText, readPiSessionId } from '../../durable/PiPrintProtocol.js';

const SESSION = '22222222-2222-4222-8222-222222222222';

describe('Pi print pure protocol mapping', () => {
    it('maps first and resumed runs to exact documented arguments', () => {
        expect(buildPiPrintArgs(SESSION, true)).toEqual(['--mode', 'json', '--session-id', SESSION]);
        expect(buildPiPrintArgs(SESSION, false)).toEqual(['--mode', 'json', '--session', SESSION]);
    });

    it('accepts one expected UUID and rejects invalid, duplicate, and mismatched identities', () => {
        expect(readPiSessionId({ id: SESSION }, null, SESSION)).toBe(SESSION);
        expect(() => readPiSessionId({}, null, SESSION)).toThrowError(expect.objectContaining({ code: 'PI_PROTOCOL' }));
        expect(() => readPiSessionId({ id: SESSION }, SESSION, SESSION)).toThrowError(expect.objectContaining({ code: 'PI_PROTOCOL' }));
        expect(() => readPiSessionId({ id: '33333333-3333-4333-8333-333333333333' }, null, SESSION))
            .toThrowError(expect.objectContaining({ code: 'PI_SESSION_MISMATCH' }));
    });

    it('extracts only non-empty completed assistant text', () => {
        expect(readPiAssistantText({ type: 'future' })).toBeNull();
        expect(readPiAssistantText({ type: 'message_end' })).toBeNull();
        expect(readPiAssistantText({ type: 'message_end', message: [] })).toBeNull();
        expect(readPiAssistantText({ type: 'message_end', message: { role: 'user', content: 'no' } })).toBeNull();
        expect(readPiAssistantText({ type: 'message_end', message: { role: 'assistant', content: ' ' } })).toBeNull();
        expect(readPiAssistantText({ type: 'message_end', message: { role: 'assistant', content: 'answer' } })).toBe('answer');
        expect(readPiAssistantText({ type: 'message_end', message: { role: 'assistant', content: null } })).toBeNull();
        expect(readPiAssistantText({ type: 'message_end', message: { role: 'assistant', content: [null, [], { type: 'thinking' }] } })).toBeNull();
        expect(readPiAssistantText({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 1 }, { type: 'text', text: 'b' }] } })).toBe('ab');
    });
});
