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

        it('sends message via tmux send-keys', async () => {
            mockExecFileSuccess();

            await TtyWriter.send(location, 'continue');

            expect(mockedExecFile).toHaveBeenCalledWith(
                'tmux',
                ['send-keys', '-t', 'main:0.1', 'continue', 'Enter'],
                expect.any(Function),
            );
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

            expect(mockedExecFile).toHaveBeenCalledWith(
                'osascript',
                ['-e', expect.stringContaining('write text "hello"')],
                expect.any(Function),
            );
        });

        it('escapes special characters in message', async () => {
            mockExecFileSuccess('ok');

            await TtyWriter.send(location, 'say "hi" \\ there');

            expect(mockedExecFile).toHaveBeenCalledWith(
                'osascript',
                ['-e', expect.stringContaining('write text "say \\"hi\\" \\\\ there"')],
                expect.any(Function),
            );
        });

        it('throws when session not found', async () => {
            mockExecFileSuccess('not_found');

            await expect(TtyWriter.send(location, 'test'))
                .rejects.toThrow('iTerm2 session not found');
        });
    });

    describe('Terminal.app', () => {
        const location: TerminalLocation = {
            type: TerminalType.TERMINAL_APP,
            identifier: '/dev/ttys030',
            tty: '/dev/ttys030',
        };

        it('sends message via System Events keystroke (not do script)', async () => {
            mockExecFileSuccess('ok');

            await TtyWriter.send(location, 'hello');

            const scriptArg = (mockedExecFile.mock.calls[0] as unknown[])[1] as string[];
            const script = scriptArg[1];
            // Must use keystroke, NOT do script
            expect(script).toContain('keystroke "hello"');
            expect(script).toContain('key code 36');
            expect(script).not.toContain('do script');
        });

        it('uses execFile to avoid shell injection', async () => {
            mockExecFileSuccess('ok');

            await TtyWriter.send(location, "don't stop");

            expect(mockedExecFile).toHaveBeenCalledWith(
                'osascript',
                ['-e', expect.any(String)],
                expect.any(Function),
            );
        });

        it('throws when tab not found', async () => {
            mockExecFileSuccess('not_found');

            await expect(TtyWriter.send(location, 'test'))
                .rejects.toThrow('Terminal.app tab not found');
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
