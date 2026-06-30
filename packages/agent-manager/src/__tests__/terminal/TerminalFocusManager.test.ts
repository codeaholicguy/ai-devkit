import { execFile } from 'child_process';
import type { MockedFunction } from 'vitest';

import { TerminalFocusManager, TerminalType } from '../../terminal/TerminalFocusManager.js';
import type { TerminalLocation } from '../../terminal/TerminalFocusManager.js';
import { getProcessTty } from '../../utils/process.js';

vi.mock('child_process', () => ({
    execFile: vi.fn(),
}));

vi.mock('../../utils/process.js', async () => {
    const actual = await vi.importActual<typeof import('../../utils/process.js')>('../../utils/process.js');
    return {
        ...actual,
        getProcessTty: vi.fn(),
    };
});

type ExecFileCb = (err: Error | null, result?: { stdout: string; stderr: string }) => void;
const mockedExecFile = execFile as unknown as MockedFunction<
    (cmd: string, args: string[], cb: ExecFileCb) => void
>;
const mockedGetProcessTty = getProcessTty as MockedFunction<typeof getProcessTty>;

function setExecFileHandler(handler: (cmd: string, args: string[]) => string | Error) {
    mockedExecFile.mockImplementation((cmd, args, cb) => {
        const result = handler(cmd, args);
        if (result instanceof Error) cb(result);
        else cb(null, { stdout: result, stderr: '' });
    });
}

describe('TerminalFocusManager', () => {
    beforeEach(() => {
        mockedExecFile.mockReset();
        mockedGetProcessTty.mockReset();
        mockedGetProcessTty.mockReturnValue('ttys000');
    });

    it('finds iTerm2 when the process is listed by full app binary path', async () => {
        setExecFileHandler((cmd, args) => {
            if (cmd === 'tmux') return new Error('tmux not running');
            if (cmd === 'pgrep') return new Error('pgrep did not match GUI app');
            if (cmd === 'ps' && args.join(' ') === '-Axo comm') {
                return '/Applications/iTerm.app/Contents/MacOS/iTerm2\n';
            }
            if (cmd === 'osascript') return 'found\n';
            return '';
        });

        const location = await new TerminalFocusManager().findTerminal(123);

        expect(location).toEqual({
            type: TerminalType.ITERM2,
            identifier: '/dev/ttys000',
            tty: '/dev/ttys000',
        });
        expect(mockedExecFile).not.toHaveBeenCalledWith(
            'pgrep',
            expect.any(Array),
            expect.any(Function),
        );
    });

    describe('WezTerm', () => {
        const listArgs = ['cli', 'list', '--format', 'json'];

        it('finds the WezTerm pane whose tty_name matches the agent tty', async () => {
            setExecFileHandler((cmd, args) => {
                if (cmd === 'tmux') return new Error('tmux not running');
                if (cmd === 'wezterm' && args.join(' ') === listArgs.join(' ')) {
                    return JSON.stringify([
                        { pane_id: 3, tty_name: '/dev/ttys099', cwd: '/x' },
                        { pane_id: 7, tty_name: '/dev/ttys000', cwd: '/y' },
                    ]);
                }
                return '';
            });

            const location = await new TerminalFocusManager().findTerminal(123);

            expect(location).toEqual({
                type: TerminalType.WEZTERM,
                identifier: '7',
                tty: '/dev/ttys000',
            });
        });

        it('skips the macOS AppleScript probes when WezTerm matches', async () => {
            setExecFileHandler((cmd) => {
                if (cmd === 'tmux') return new Error('tmux not running');
                if (cmd === 'wezterm') {
                    return JSON.stringify([{ pane_id: 7, tty_name: '/dev/ttys000' }]);
                }
                return '';
            });

            await new TerminalFocusManager().findTerminal(123);

            expect(mockedExecFile).not.toHaveBeenCalledWith(
                'osascript',
                expect.any(Array),
                expect.any(Function),
            );
        });

        it('returns UNKNOWN when WezTerm is installed but no pane matches the tty', async () => {
            setExecFileHandler((cmd) => {
                if (cmd === 'tmux') return new Error('tmux not running');
                if (cmd === 'wezterm') {
                    return JSON.stringify([{ pane_id: 7, tty_name: '/dev/ttys099' }]);
                }
                return '';
            });

            const location = await new TerminalFocusManager().findTerminal(123);

            expect(location?.type).toBe(TerminalType.UNKNOWN);
        });

        it('returns UNKNOWN (without throwing) on malformed JSON from wezterm', async () => {
            setExecFileHandler((cmd) => {
                if (cmd === 'tmux') return new Error('tmux not running');
                if (cmd === 'wezterm') return 'not-json{';
                return '';
            });

            const location = await new TerminalFocusManager().findTerminal(123);

            expect(location?.type).toBe(TerminalType.UNKNOWN);
        });

        it('returns UNKNOWN when the wezterm binary is missing', async () => {
            setExecFileHandler((cmd) => {
                if (cmd === 'tmux') return new Error('tmux not running');
                if (cmd === 'wezterm') return new Error('spawn wezterm ENOENT');
                return '';
            });

            const location = await new TerminalFocusManager().findTerminal(123);

            expect(location?.type).toBe(TerminalType.UNKNOWN);
        });

        it('prefers tmux over WezTerm (tmux-inside-WezTerm resolves to tmux)', async () => {
            setExecFileHandler((cmd) => {
                if (cmd === 'tmux') {
                    return `/dev/ttys000|my:0.1`;
                }
                if (cmd === 'wezterm') {
                    return JSON.stringify([{ pane_id: 7, tty: '/dev/ttys000' }]);
                }
                return '';
            });

            const location = await new TerminalFocusManager().findTerminal(123);

            expect(location).toEqual({
                type: TerminalType.TMUX,
                identifier: 'my:0.1',
                tty: '/dev/ttys000',
            });
            // WezTerm must not even be queried when tmux already matched.
            expect(mockedExecFile).not.toHaveBeenCalledWith(
                'wezterm',
                expect.any(Array),
                expect.any(Function),
            );
        });
    });

    describe('focusTerminal for WezTerm', () => {
        const location: TerminalLocation = {
            type: TerminalType.WEZTERM,
            identifier: '7',
            tty: '/dev/ttys000',
        };

        it('focuses the pane via wezterm cli activate-pane --pane-id', async () => {
            setExecFileHandler((cmd, args) => {
                if (cmd === 'wezterm' && args.join(' ') === 'cli activate-pane --pane-id 7') {
                    return '';
                }
                return '';
            });

            const ok = await new TerminalFocusManager().focusTerminal(location);

            expect(ok).toBe(true);
            expect(mockedExecFile).toHaveBeenCalledWith(
                'wezterm',
                ['cli', 'activate-pane', '--pane-id', '7'],
                expect.any(Function),
            );
        });

        it('returns false (without throwing) when focus fails', async () => {
            setExecFileHandler((cmd) => {
                if (cmd === 'wezterm') return new Error('boom');
                return '';
            });

            const ok = await new TerminalFocusManager().focusTerminal(location);

            expect(ok).toBe(false);
        });
    });

    describe('debug tracing', () => {
        it('emits the matching decision path via the debug logger', async () => {
            const debug = vi.fn();
            setExecFileHandler((cmd, args) => {
                if (cmd === 'tmux') return new Error('tmux not running');
                if (cmd === 'wezterm' && args.join(' ').includes('cli list')) {
                    return JSON.stringify([{ pane_id: 7, tty_name: '/dev/ttys000' }]);
                }
                return '';
            });

            const location = await new TerminalFocusManager(debug).findTerminal(123);

            expect(location?.type).toBe(TerminalType.WEZTERM);
            const messages = debug.mock.calls.map((call) => call[0] as string);
            expect(messages.some((m) => /pid=123/.test(m))).toBe(true);
            expect(messages.some((m) => /tmux.*no match|tmux: no/i.test(m))).toBe(true);
            expect(messages.some((m) => /wezterm/i.test(m))).toBe(true);
        });

        it('emits the focus decision path via the debug logger', async () => {
            const debug = vi.fn();
            setExecFileHandler((cmd, args) => {
                if (cmd === 'wezterm' && args.join(' ') === 'cli activate-pane --pane-id 7') {
                    return '';
                }
                return '';
            });

            const ok = await new TerminalFocusManager(debug).focusTerminal({
                type: TerminalType.WEZTERM,
                identifier: '7',
                tty: '/dev/ttys000',
            });

            expect(ok).toBe(true);
            const messages = debug.mock.calls.map((call) => call[0] as string);
            expect(messages.some((m) => /focusing wezterm/i.test(m))).toBe(true);
            expect(messages.some((m) => /succeeded/i.test(m))).toBe(true);
        });
    });

    it('finds Terminal.app when the process is listed by app bundle path', async () => {
        setExecFileHandler((cmd, args) => {
            if (cmd === 'tmux') return new Error('tmux not running');
            if (cmd === 'pgrep') return new Error('pgrep did not match GUI app');
            if (cmd === 'ps' && args.join(' ') === '-Axo comm') {
                return '/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal\n';
            }
            if (cmd === 'osascript') {
                const script = args[1] ?? '';
                return script.includes('tell application "Terminal"') ? 'found\n' : '';
            }
            return '';
        });

        const location = await new TerminalFocusManager().findTerminal(123);

        expect(location).toEqual({
            type: TerminalType.TERMINAL_APP,
            identifier: '/dev/ttys000',
            tty: '/dev/ttys000',
        });
        expect(mockedExecFile).not.toHaveBeenCalledWith(
            'pgrep',
            expect.any(Array),
            expect.any(Function),
        );
    });
});
