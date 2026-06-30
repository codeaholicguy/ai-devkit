
import {
    formatFirstMessage,
    parseLimit,
    resolveListSessionsOptions,
    toJsonSession,
} from '../../util/sessions.js';

describe('sessions util', () => {
    describe('resolveListSessionsOptions', () => {
        const realCwd = process.cwd();

        afterEach(() => {
            // process.cwd() is real; nothing to restore.
        });

        it('falls back to process.cwd() and flags usedDefaultCwd=true', () => {
            const result = resolveListSessionsOptions({});
            expect(result.adapterOptions.cwd).toBe(realCwd);
            expect(result.usedDefaultCwd).toBe(true);
            expect(result.adapterOptions.type).toBeUndefined();
        });

        it('clears the cwd filter when --all is set', () => {
            const result = resolveListSessionsOptions({ all: true });
            expect(result.adapterOptions.cwd).toBeUndefined();
            expect(result.usedDefaultCwd).toBe(false);
        });

        it('uses --cwd <path> verbatim when provided without --all', () => {
            const result = resolveListSessionsOptions({ cwd: '/Users/test/proj' });
            expect(result.adapterOptions.cwd).toBe('/Users/test/proj');
            expect(result.usedDefaultCwd).toBe(false);
        });

        it('--all wins over --cwd', () => {
            const result = resolveListSessionsOptions({ all: true, cwd: '/ignored' });
            expect(result.adapterOptions.cwd).toBeUndefined();
        });

        it('empty --cwd string falls back to process.cwd()', () => {
            const result = resolveListSessionsOptions({ cwd: '' });
            expect(result.adapterOptions.cwd).toBe(realCwd);
            expect(result.usedDefaultCwd).toBe(true);
        });

        it('forwards a valid --type', () => {
            for (const type of ['claude', 'codex', 'gemini_cli', 'grok_cli', 'opencode', 'copilot', 'pi'] as const) {
                const result = resolveListSessionsOptions({ all: true, type });
                expect(result.adapterOptions.type).toBe(type);
            }
        });

        it('throws on an invalid --type', () => {
            expect(() => resolveListSessionsOptions({ all: true, type: 'wrong' })).toThrow(
                'Invalid --type "wrong". Expected one of: claude, codex, gemini_cli, grok_cli, opencode, copilot, pi.',
            );
        });

        it('treats an empty --type as undefined (no filter)', () => {
            const result = resolveListSessionsOptions({ all: true, type: '' });
            expect(result.adapterOptions.type).toBeUndefined();
        });
    });

    describe('parseLimit', () => {
        it('returns 50 by default when the flag is omitted', () => {
            expect(parseLimit(undefined)).toBe(50);
        });

        it('parses a string integer', () => {
            expect(parseLimit('25')).toBe(25);
        });

        it('passes a number through directly', () => {
            expect(parseLimit(7)).toBe(7);
        });

        it('returns undefined (no cap) when the value is 0', () => {
            expect(parseLimit('0')).toBeUndefined();
            expect(parseLimit(0)).toBeUndefined();
        });

        it('throws on a non-numeric string', () => {
            expect(() => parseLimit('abc')).toThrow(/non-negative integer/);
        });

        it('throws on a negative number', () => {
            expect(() => parseLimit('-3')).toThrow(/non-negative integer/);
            expect(() => parseLimit(-1)).toThrow(/non-negative integer/);
        });
    });

    describe('formatFirstMessage', () => {
        it('substitutes the placeholder for an empty string', () => {
            expect(formatFirstMessage('')).toBe('(no message yet)');
        });

        it('passes short text through unchanged', () => {
            expect(formatFirstMessage('hello world')).toBe('hello world');
        });

        it('truncates long text to 80 chars with an ellipsis suffix', () => {
            const long = 'x'.repeat(200);
            const out = formatFirstMessage(long);
            expect(out).toHaveLength(80);
            expect(out.endsWith('…')).toBe(true);
        });

        it('passes text exactly at 80 chars unchanged', () => {
            const eighty = 'a'.repeat(80);
            expect(formatFirstMessage(eighty)).toBe(eighty);
        });
    });

    describe('toJsonSession', () => {
        it('serializes Date fields as ISO strings and passes others through', () => {
            const out = toJsonSession({
                type: 'claude',
                sessionId: 'abc',
                cwd: '/repo',
                firstUserMessage: 'hi',
                lastActive: new Date('2025-06-01T12:00:00Z'),
                startedAt: new Date('2025-06-01T11:00:00Z'),
                sessionFilePath: '/tmp/abc.jsonl',
            });

            expect(out).toEqual({
                type: 'claude',
                sessionId: 'abc',
                cwd: '/repo',
                firstUserMessage: 'hi',
                lastActive: '2025-06-01T12:00:00.000Z',
                startedAt: '2025-06-01T11:00:00.000Z',
                sessionFilePath: '/tmp/abc.jsonl',
            });
        });

        it('keeps an empty firstUserMessage raw (no placeholder substitution)', () => {
            const out = toJsonSession({
                type: 'codex',
                sessionId: 'cx',
                cwd: '',
                firstUserMessage: '',
                lastActive: new Date('2025-01-01T00:00:00Z'),
                startedAt: new Date('2025-01-01T00:00:00Z'),
                sessionFilePath: '/tmp/cx.jsonl',
            });
            expect(out.firstUserMessage).toBe('');
            expect(out.cwd).toBe('');
        });
    });
});
