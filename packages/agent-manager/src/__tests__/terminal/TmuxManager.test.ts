import { execFile } from 'child_process';
import type { MockedFunction } from 'vitest';
import { TmuxManager } from '../../terminal/TmuxManager.js';

vi.mock('child_process', () => ({
    execFile: vi.fn(),
}));

type ExecFileCb = (err: Error | null, result?: { stdout: string; stderr: string }) => void;
const mockedExecFile = execFile as unknown as MockedFunction<
    (cmd: string, args: string[], cb: ExecFileCb) => void
>;

/** Drive the promisified execFile mock with a per-call handler. */
function setExecFileHandler(handler: (cmd: string, args: string[]) => string | Error) {
    mockedExecFile.mockImplementation((_cmd, _args, cb) => {
        const result = handler(_cmd, _args);
        if (result instanceof Error) cb(result);
        else cb(null, { stdout: result, stderr: '' });
    });
}

describe('TmuxManager', () => {
    let tmux: TmuxManager;

    beforeEach(() => {
        tmux = new TmuxManager();
        mockedExecFile.mockReset();
    });

    describe('isAvailable', () => {
        it('returns true when `tmux -V` succeeds', async () => {
            setExecFileHandler(() => 'tmux 3.4');
            expect(await tmux.isAvailable()).toBe(true);
        });

        it('returns false when tmux is missing', async () => {
            setExecFileHandler(() => new Error('ENOENT'));
            expect(await tmux.isAvailable()).toBe(false);
        });
    });

    describe('sessionExists', () => {
        it('returns true when has-session succeeds', async () => {
            setExecFileHandler(() => '');
            expect(await tmux.sessionExists('foo')).toBe(true);
        });

        it('returns false when has-session fails', async () => {
            setExecFileHandler(() => new Error('no session'));
            expect(await tmux.sessionExists('foo')).toBe(false);
        });
    });

    describe('createSession', () => {
        it('issues `tmux new-session -d -s <name> -c <cwd>`', async () => {
            setExecFileHandler(() => '');
            await tmux.createSession('foo', '/work');
            expect(mockedExecFile).toHaveBeenCalledWith(
                'tmux',
                ['new-session', '-d', '-s', 'foo', '-c', '/work'],
                expect.any(Function),
            );
        });
    });

    describe('sendKeys', () => {
        it('appends Enter so the command runs', async () => {
            setExecFileHandler(() => '');
            await tmux.sendKeys('foo', 'claude');
            expect(mockedExecFile).toHaveBeenCalledWith(
                'tmux',
                ['send-keys', '-t', 'foo', 'claude', 'Enter'],
                expect.any(Function),
            );
        });
    });

    describe('killSession', () => {
        it('swallows errors when session is already gone', async () => {
            setExecFileHandler(() => new Error("can't find session"));
            await expect(tmux.killSession('foo')).resolves.toBeUndefined();
        });
    });

    describe('findAgentPid', () => {
        const matchesClaude = (cmd: string) => cmd.split(/\s+/)[0]?.endsWith('claude') ?? false;

        it('returns null when the session has no pane', async () => {
            setExecFileHandler((cmd, args) => {
                if (args[0] === 'list-panes') return new Error('no session');
                return '';
            });
            expect(await tmux.findAgentPid('foo', matchesClaude)).toBeNull();
        });

        it('returns null when no descendant matches', async () => {
            // pane PID 100; child 200 is "node /unrelated" — no match
            setExecFileHandler((cmd, args) => {
                if (cmd === 'tmux' && args[0] === 'list-panes') return '100\n';
                if (cmd === 'pgrep' && args[1] === '100') return '200\n';
                if (cmd === 'pgrep') return new Error('no children');
                if (cmd === 'ps' && args[1] === '200') return 'node /unrelated';
                return '';
            });
            expect(await tmux.findAgentPid('foo', matchesClaude)).toBeNull();
        });

        it('returns the matching descendant when found', async () => {
            // pane 100 → child 200 (claude) — no grandchildren
            setExecFileHandler((cmd, args) => {
                if (cmd === 'tmux') return '100\n';
                if (cmd === 'pgrep' && args[1] === '100') return '200\n';
                if (cmd === 'pgrep') return new Error('no children');
                if (cmd === 'ps' && args[1] === '200') return 'claude';
                return '';
            });
            expect(await tmux.findAgentPid('foo', matchesClaude)).toBe(200);
        });

        it('prefers the deepest match (wrapper case)', async () => {
            // pane 100 → 200 (claude wrapper, matches) → 300 (claude, matches, deeper)
            setExecFileHandler((cmd, args) => {
                if (cmd === 'tmux') return '100\n';
                if (cmd === 'pgrep' && args[1] === '100') return '200\n';
                if (cmd === 'pgrep' && args[1] === '200') return '300\n';
                if (cmd === 'pgrep') return new Error('no children');
                if (cmd === 'ps' && args[1] === '200') return '/usr/local/bin/claude';
                if (cmd === 'ps' && args[1] === '300') return '/usr/local/lib/claude';
                return '';
            });
            expect(await tmux.findAgentPid('foo', matchesClaude)).toBe(300);
        });

        it('skips non-matching subprocesses (MCP child case)', async () => {
            // pane 100 → 200 (claude, matches) → 300 (mcp-server, no match)
            setExecFileHandler((cmd, args) => {
                if (cmd === 'tmux') return '100\n';
                if (cmd === 'pgrep' && args[1] === '100') return '200\n';
                if (cmd === 'pgrep' && args[1] === '200') return '300\n';
                if (cmd === 'pgrep') return new Error('no children');
                if (cmd === 'ps' && args[1] === '200') return 'claude';
                if (cmd === 'ps' && args[1] === '300') return 'node mcp-server.js';
                return '';
            });
            expect(await tmux.findAgentPid('foo', matchesClaude)).toBe(200);
        });

        it('handles the gemini Node-script shape via a token-scan matcher', async () => {
            const matchesGemini = (cmd: string) =>
                cmd.split(/\s+/).some((t) => t.endsWith('/gemini') || t === 'gemini');
            setExecFileHandler((cmd, args) => {
                if (cmd === 'tmux') return '100\n';
                if (cmd === 'pgrep' && args[1] === '100') return '200\n';
                if (cmd === 'pgrep') return new Error('no children');
                if (cmd === 'ps' && args[1] === '200') return 'node /opt/homebrew/bin/gemini --foo';
                return '';
            });
            expect(await tmux.findAgentPid('foo', matchesGemini)).toBe(200);
        });

        it('handles multiple children at the same level', async () => {
            // pane 100 → [200 (nope), 201 (claude)]
            setExecFileHandler((cmd, args) => {
                if (cmd === 'tmux') return '100\n';
                if (cmd === 'pgrep' && args[1] === '100') return '200\n201\n';
                if (cmd === 'pgrep') return new Error('no children');
                if (cmd === 'ps' && args[1] === '200') return 'bash';
                if (cmd === 'ps' && args[1] === '201') return 'claude';
                return '';
            });
            expect(await tmux.findAgentPid('foo', matchesClaude)).toBe(201);
        });
    });
});
