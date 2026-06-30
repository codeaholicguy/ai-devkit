import type { Mock } from 'vitest';

import { TtyWriter } from '../../terminal/TtyWriter.js';
import { TerminalType } from '../../terminal/TerminalFocusManager.js';
import type { TerminalLocation } from '../../terminal/TerminalFocusManager.js';
import { execFile } from 'child_process';

vi.mock('child_process', async () => {
    const actual = await vi.importActual<typeof import('child_process')>('child_process');
    return {
        ...actual,
        execFile: vi.fn(),
    };
});

const mockedExecFile = execFile as unknown as Mock;

function mockExecFileSuccess(stdout = '') {
    mockedExecFile.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as (err: Error | null, result: { stdout: string }, stderr: string) => void;
        cb(null, { stdout }, '');
        return { stdin: { end: vi.fn() } };
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
        vi.clearAllMocks();
    });

    describe('tmux', () => {
        const location: TerminalLocation = {
            type: TerminalType.TMUX,
            identifier: 'main:0.1',
            tty: '/dev/ttys030',
        };

        it('pastes message in bracketed paste mode and sends Enter separately', async () => {
            mockExecFileSuccess();
            const message = 'line 1\nline 2\n';

            await TtyWriter.send(location, message);

            const loadArgs = mockedExecFile.mock.calls[0]?.[1] as string[];
            const bufferName = loadArgs[2];
            expect(bufferName).toMatch(/^ai-devkit-send-/);
            expect(mockedExecFile).toHaveBeenNthCalledWith(
                1,
                'tmux',
                ['load-buffer', '-b', bufferName, '-'],
                expect.any(Function),
            );
            expect(mockedExecFile.mock.results[0]?.value.stdin.end)
                .toHaveBeenCalledWith(message);
            expect(mockedExecFile).toHaveBeenNthCalledWith(
                2,
                'tmux',
                ['paste-buffer', '-t', 'main:0.1', '-b', bufferName, '-p', '-d'],
                expect.any(Function),
            );
            expect(mockedExecFile).toHaveBeenNthCalledWith(
                3,
                'tmux',
                ['send-keys', '-t', 'main:0.1', 'Enter'],
                expect.any(Function),
            );
            expect(mockedExecFile).toHaveBeenCalledTimes(3);
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

    describe('WezTerm', () => {
        const location: TerminalLocation = {
            type: TerminalType.WEZTERM,
            identifier: '7',
            tty: '/dev/ttys030',
        };

        it('sends the message via stdin and Enter as a separate send-text call', async () => {
            mockExecFileSuccess();

            await TtyWriter.send(location, 'continue');

            // Step 1: message body via stdin, not argv, so prompt contents are
            // not exposed through process listings.
            expect(mockedExecFile).toHaveBeenCalledWith(
                'wezterm',
                ['cli', 'send-text', '--pane-id', '7'],
                expect.any(Function),
            );
            expect(mockedExecFile.mock.results[0]?.value.stdin.end)
                .toHaveBeenCalledWith('continue');
            // Step 2: Enter as a single carriage return (0x0d) with --no-paste,
            // so the CR is delivered literally (not wrapped in paste brackets).
            // execFile passes the actual CR byte (JS '\x0d'); the equivalent
            // shell command is:
            //   wezterm cli send-text --pane-id <id> --no-paste $'\x0d'
            expect(mockedExecFile).toHaveBeenCalledWith(
                'wezterm',
                ['cli', 'send-text', '--pane-id', '7', '--no-paste', '\x0d'],
                expect.any(Function),
            );
            expect(mockedExecFile).toHaveBeenCalledTimes(2);
        });

        it('passes the Enter byte as the carriage return (0x0d), not newline', async () => {
            mockExecFileSuccess();

            await TtyWriter.send(location, 'continue');

            // The Enter call is the second invocation; its last argv element is
            // a single byte equal to char code 13 (0x0d).
            const enterCall = mockedExecFile.mock.calls[1];
            const enterArgs = enterCall[1] as string[];
            const enterByte = enterArgs[enterArgs.length - 1];
            expect(enterByte).toHaveLength(1);
            expect(enterByte.charCodeAt(0)).toBe(0x0d);
            expect(enterArgs).toContain('--no-paste');
        });

        it('keeps the whole message out of argv and writes it verbatim to stdin', async () => {
            mockExecFileSuccess();
            const hostile = 'echo pwned; $(rm -rf /) `whoami` | cat\nline2';

            await TtyWriter.send(location, hostile);

            // The message is written verbatim to stdin, not built into a shell
            // string or exposed as a process argument.
            const textCall = mockedExecFile.mock.calls[0];
            const textArgs = textCall[1] as string[];
            expect(textArgs).toEqual(
                ['cli', 'send-text', '--pane-id', '7'],
            );
            expect(textCall[2]).toBeTypeOf('function');
            expect(mockedExecFile.mock.results[0]?.value.stdin.end)
                .toHaveBeenCalledWith(hostile);
        });

        it('uses the pane id from location.identifier', async () => {
            mockExecFileSuccess();
            const pane42 = { ...location, identifier: '42' };

            await TtyWriter.send(pane42, 'hi');

            expect(mockedExecFile).toHaveBeenCalledWith(
                'wezterm',
                ['cli', 'send-text', '--pane-id', '42'],
                expect.any(Function),
            );
            expect(mockedExecFile.mock.results[0]?.value.stdin.end)
                .toHaveBeenCalledWith('hi');
        });

        it('throws when the text send fails', async () => {
            mockExecFileError('wezterm send-text failed');

            await expect(TtyWriter.send(location, 'hello'))
                .rejects.toThrow('wezterm send-text failed');
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

    describe('sendKey — tmux', () => {
        const location: TerminalLocation = {
            type: TerminalType.TMUX,
            identifier: 'main:0.1',
            tty: '/dev/ttys030',
        };

        it('sends key via tmux send-keys directly (no paste buffer, no auto-Enter)', async () => {
            mockExecFileSuccess();

            await TtyWriter.sendKey(location, '1');

            expect(mockedExecFile).toHaveBeenCalledTimes(1);
            expect(mockedExecFile).toHaveBeenCalledWith(
                'tmux',
                ['send-keys', '-t', 'main:0.1', '1'],
                expect.any(Function),
            );
        });

        it('passes through named keys like Enter', async () => {
            mockExecFileSuccess();
            await TtyWriter.sendKey(location, 'Enter');
            expect(mockedExecFile).toHaveBeenCalledWith(
                'tmux',
                ['send-keys', '-t', 'main:0.1', 'Enter'],
                expect.any(Function),
            );
        });

        it('translates Esc byte (\\x1b) to the named "Escape" key', async () => {
            mockExecFileSuccess();
            await TtyWriter.sendKey(location, '\x1b');
            expect(mockedExecFile).toHaveBeenCalledWith(
                'tmux',
                ['send-keys', '-t', 'main:0.1', 'Escape'],
                expect.any(Function),
            );
        });
    });

    describe('sendKey — WezTerm', () => {
        const location: TerminalLocation = {
            type: TerminalType.WEZTERM,
            identifier: '7',
            tty: '/dev/ttys030',
        };

        it('uses wezterm cli send-text --no-paste to deliver a raw key', async () => {
            mockExecFileSuccess();

            await TtyWriter.sendKey(location, '1');

            expect(mockedExecFile).toHaveBeenCalledTimes(1);
            expect(mockedExecFile).toHaveBeenCalledWith(
                'wezterm',
                ['cli', 'send-text', '--pane-id', '7', '--no-paste', '1'],
                expect.any(Function),
            );
        });
    });

    describe('sendKey — iTerm2', () => {
        const location: TerminalLocation = {
            type: TerminalType.ITERM2,
            identifier: '/dev/ttys030',
            tty: '/dev/ttys030',
        };

        it('uses System Events keystroke after activating the iTerm2 session', async () => {
            mockExecFileSuccess('ok');

            await TtyWriter.sendKey(location, '2');

            const args = (mockedExecFile.mock.calls[0] as unknown[])[1] as string[];
            const script = args[1];
            expect(script).toContain('tell application "iTerm"');
            expect(script).toContain('tell application "System Events" to keystroke "2"');
            expect(mockedExecFile).toHaveBeenCalledTimes(1);
        });

        it('translates Esc byte (\\x1b) to AppleScript `key code 53`', async () => {
            mockExecFileSuccess('ok');
            await TtyWriter.sendKey(location, '\x1b');
            const args = (mockedExecFile.mock.calls[0] as unknown[])[1] as string[];
            const script = args[1];
            expect(script).toContain('tell application "System Events" to key code 53');
            expect(script).not.toContain('keystroke');
        });

        it('throws when session not found', async () => {
            mockExecFileSuccess('not_found');
            await expect(TtyWriter.sendKey(location, '1'))
                .rejects.toThrow('iTerm2 session not found');
        });
    });

    describe('sendKey — Terminal.app', () => {
        const location: TerminalLocation = {
            type: TerminalType.TERMINAL_APP,
            identifier: '/dev/ttys030',
            tty: '/dev/ttys030',
        };

        it('uses System Events keystroke after selecting the Terminal.app tab', async () => {
            mockExecFileSuccess('ok');

            await TtyWriter.sendKey(location, '3');

            const args = (mockedExecFile.mock.calls[0] as unknown[])[1] as string[];
            const script = args[1];
            expect(script).toContain('tell application "Terminal"');
            expect(script).toContain('tell application "System Events" to keystroke "3"');
            expect(mockedExecFile).toHaveBeenCalledTimes(1);
        });

        it('translates Esc byte (\\x1b) to AppleScript `key code 53`', async () => {
            mockExecFileSuccess('ok');
            await TtyWriter.sendKey(location, '\x1b');
            const args = (mockedExecFile.mock.calls[0] as unknown[])[1] as string[];
            const script = args[1];
            expect(script).toContain('tell application "System Events" to key code 53');
            expect(script).not.toContain('keystroke');
        });

        it('throws when tab not found', async () => {
            mockExecFileSuccess('not_found');
            await expect(TtyWriter.sendKey(location, '1'))
                .rejects.toThrow('Terminal.app tab not found');
        });
    });

    describe('sendKey — unsupported terminal', () => {
        it('throws for unknown terminal type', async () => {
            const location: TerminalLocation = {
                type: TerminalType.UNKNOWN,
                identifier: '',
                tty: '/dev/ttys030',
            };
            await expect(TtyWriter.sendKey(location, '1'))
                .rejects.toThrow('Cannot send key: unsupported terminal type');
        });
    });
});
