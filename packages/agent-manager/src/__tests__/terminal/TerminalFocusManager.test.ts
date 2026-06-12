import { execFile } from 'child_process';
import type { MockedFunction } from 'vitest';

import { TerminalFocusManager, TerminalType } from '../../terminal/TerminalFocusManager.js';
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
