import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { TtyWriter } from '../../terminal/TtyWriter';
import { TerminalType } from '../../terminal/TerminalFocusManager';
import type { TerminalLocation } from '../../terminal/TerminalFocusManager';
import { execFile } from 'child_process';

jest.mock('child_process', () => {
    const actual = jest.requireActual<typeof import('child_process')>('child_process');
    return {
        ...actual,
        execFile: jest.fn(),
    };
});

const mockedExecFile = execFile as unknown as jest.Mock;

function mockExecFileSuccess(stdout = '') {
    mockedExecFile.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as (err: Error | null, result: { stdout: string }, stderr: string) => void;
        cb(null, { stdout }, '');
    });
}

function mockExecFileError(message: string) {
    mockedExecFile.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as (err: Error | null, result: null, stderr: string) => void;
        cb(new Error(message), null, '');
    });
}

describe('TtyWriter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('tmux', () => {
        const location: TerminalLocation = {
            type: TerminalType.TMUX,
            identifier: 'main:0.1',
            tty: '/dev/ttys030',
        };

        it('sends message and Enter as separate tmux send-keys calls', async () => {
            mockExecFileSuccess();

            await TtyWriter.send(location, 'continue');

            expect(mockedExecFile).toHaveBeenCalledWith(
                'tmux',
                ['send-keys', '-t', 'main:0.1', '-l', 'continue'],
                expect.any(Function),
            );
            expect(mockedExecFile).toHaveBeenCalledWith(
                'tmux',
                ['send-keys', '-t', 'main:0.1', 'Enter'],
                expect.any(Function),
            );
            expect(mockedExecFile).toHaveBeenCalledTimes(2);
        });

        it('throws on tmux failure', async () => {
            mockExecFileError('tmux not running');

            await expect(TtyWriter.send(location, 'hello'))
                .rejects.toThrow('tmux not running');
        });
    });

    describe('iTerm2', () => {
        const location: TerminalLocation = {
            type: TerminalType.ITERM2,
            identifier: '/dev/ttys030',
            tty: '/dev/ttys030',
        };

        it('sends message via osascript with execFile (no shell)', async () => {
            mockExecFileSuccess('ok');

            await TtyWriter.send(location, 'hello');

            // First call: send text without newline
            expect(mockedExecFile).toHaveBeenCalledWith(
                'osascript',
                ['-e', expect.stringContaining('write text "hello" newline no')],
                expect.any(Function),
            );
            // Second call: send Enter via separate write text with newline
            expect(mockedExecFile).toHaveBeenCalledWith(
                'osascript',
                ['-e', expect.stringContaining('write text "" newline yes')],
                expect.any(Function),
            );
            expect(mockedExecFile).toHaveBeenCalledTimes(2);
        });

        it('escapes special characters in message', async () => {
            mockExecFileSuccess('ok');

            await TtyWriter.send(location, 'say "hi" \\ there');

            expect(mockedExecFile).toHaveBeenCalledWith(
                'osascript',
                ['-e', expect.stringContaining('write text "say \\"hi\\" \\\\ there" newline no')],
                expect.any(Function),
            );
        });

        it('escapes newlines in message', async () => {
            mockExecFileSuccess('ok');

            await TtyWriter.send(location, 'line1\nline2');

            expect(mockedExecFile).toHaveBeenCalledWith(
                'osascript',
                ['-e', expect.stringContaining('write text "line1\\nline2" newline no')],
                expect.any(Function),
            );
        });

        it('throws when session not found', async () => {
            mockExecFileSuccess('not_found');

            await expect(TtyWriter.send(location, 'test'))
                .rejects.toThrow('iTerm2 session not found');
        });

        it('throws when session disappears before Enter', async () => {
            // First call succeeds (text sent), second returns not_found
            let callCount = 0;
            mockedExecFile.mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (err: Error | null, result: { stdout: string }, stderr: string) => void;
                callCount++;
                cb(null, { stdout: callCount === 1 ? 'ok' : 'not_found' }, '');
            });

            await expect(TtyWriter.send(location, 'test'))
                .rejects.toThrow('iTerm2 session disappeared before Enter');
        });
    });

    describe('Terminal.app', () => {
        const location: TerminalLocation = {
            type: TerminalType.TERMINAL_APP,
            identifier: '/dev/ttys030',
            tty: '/dev/ttys030',
        };

        it('sends message via do script (not System Events)', async () => {
            mockExecFileSuccess('ok');

            await TtyWriter.send(location, 'hello');

            // First call: send text via do script
            const firstCallArgs = (mockedExecFile.mock.calls[0] as unknown[])[1] as string[];
            const textScript = firstCallArgs[1];
            expect(textScript).toContain('do script "hello" in targetTab');
            expect(textScript).not.toContain('keystroke');
            expect(textScript).not.toContain('key code 36');

            // Second call: send Enter via separate do script
            const secondCallArgs = (mockedExecFile.mock.calls[1] as unknown[])[1] as string[];
            const enterScript = secondCallArgs[1];
            expect(enterScript).toContain('do script "" in targetTab');

            expect(mockedExecFile).toHaveBeenCalledTimes(2);
        });

        it('throws when tab not found', async () => {
            mockExecFileSuccess('not_found');

            await expect(TtyWriter.send(location, 'test'))
                .rejects.toThrow('Terminal.app tab not found');
        });

        it('throws when tab disappears before Enter', async () => {
            let callCount = 0;
            mockedExecFile.mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (err: Error | null, result: { stdout: string }, stderr: string) => void;
                callCount++;
                cb(null, { stdout: callCount === 1 ? 'ok' : 'not_found' }, '');
            });

            await expect(TtyWriter.send(location, 'test'))
                .rejects.toThrow('Terminal.app tab disappeared before Enter');
        });
    });

    describe('unsupported terminal', () => {
        it('throws for unknown terminal type', async () => {
            const location: TerminalLocation = {
                type: TerminalType.UNKNOWN,
                identifier: '',
                tty: '/dev/ttys030',
            };

            await expect(TtyWriter.send(location, 'test'))
                .rejects.toThrow('Cannot send input: unsupported terminal type');
        });
    });
});
