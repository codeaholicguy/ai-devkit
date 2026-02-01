import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { TerminalFocusManager } from '../../lib/TerminalFocusManager';

const mockExec = jest.fn();
jest.mock('child_process', () => ({
    exec: (cmd: string, cb: any) => mockExec(cmd, cb)
}));

// Mock getProcessTty - we use requireActual to keep other exports if needed, 
// strictly we only need getProcessTty here.
jest.mock('../../util/process', () => ({
    getProcessTty: jest.fn(),
}));
import { getProcessTty } from '../../util/process';

describe('TerminalFocusManager', () => {
    let manager: TerminalFocusManager;
    const mockGetProcessTty = getProcessTty as unknown as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new TerminalFocusManager();
    });

    describe('findTerminal', () => {
        it('should return null if process TTY is missing', async () => {
            mockGetProcessTty.mockReturnValue('?');
            const result = await manager.findTerminal(123);
            expect(result).toBeNull();
        });

        it('should detect tmux pane', async () => {
            mockGetProcessTty.mockReturnValue('ttys001');

            mockExec.mockImplementation((cmd: any, callback: any) => {

                if (cmd.includes('tmux list-panes')) {
                    callback(null, { stdout: '/dev/ttys002|session:0.1\n/dev/ttys001|my-session:1.2\n', stderr: '' });
                } else {
                    // Default fallback
                    callback(null, { stdout: '', stderr: '' });
                }
            });

            const result = await manager.findTerminal(123);

            expect(result).toEqual({
                type: 'tmux',
                identifier: 'my-session:1.2',
                tty: '/dev/ttys001'
            });
        });

        it('should detect iTerm2 session', async () => {
            mockGetProcessTty.mockReturnValue('ttys001');

            mockExec.mockImplementation((cmd: any, callback: any) => {
                if (cmd.includes('tmux')) {
                    // Not found in tmux
                    callback(null, { stdout: '/dev/ttys002|session:0.1', stderr: '' });
                } else if (cmd.includes('pgrep -x iTerm2')) {
                    callback(null, { stdout: '12345', stderr: '' });
                } else if (cmd.includes('osascript') && cmd.includes('tell application "iTerm"')) {
                    callback(null, { stdout: 'found', stderr: '' });
                } else {
                    callback(null, { stdout: '', stderr: '' });
                }
            });

            const result = await manager.findTerminal(123);

            expect(result).toEqual({
                type: 'iterm2',
                identifier: '/dev/ttys001',
                tty: '/dev/ttys001'
            });
        });

        it('should detect Terminal.app window', async () => {
            mockGetProcessTty.mockReturnValue('ttys001');

            mockExec.mockImplementation((cmd: any, callback: any) => {
                if (cmd.includes('tmux')) {
                    callback(null, { stdout: '', stderr: '' });
                } else if (cmd.includes('pgrep -x iTerm2')) {
                    callback(null, { stdout: 'no', stderr: '' });
                } else if (cmd.includes('pgrep -x Terminal')) {
                    callback(null, { stdout: '54321', stderr: '' });
                } else if (cmd.includes('osascript') && cmd.includes('tell application "Terminal"')) {
                    callback(null, { stdout: 'found', stderr: '' });
                } else {
                    callback(null, { stdout: '', stderr: '' });
                }
            });

            const result = await manager.findTerminal(123);

            expect(result).toEqual({
                type: 'terminal-app',
                identifier: '/dev/ttys001',
                tty: '/dev/ttys001'
            });
        });

        it('should return unknown type if no specific terminal found', async () => {
            mockGetProcessTty.mockReturnValue('ttys001');

            mockExec.mockImplementation((cmd: any, callback: any) => {
                if (cmd.includes('tmux')) callback(null, { stdout: '', stderr: '' });
                else if (cmd.includes('pgrep')) callback(null, { stdout: 'no', stderr: '' });
                else callback(null, { stdout: '', stderr: '' });
            });

            const result = await manager.findTerminal(123);

            expect(result).toEqual({
                type: 'unknown',
                identifier: '',
                tty: '/dev/ttys001'
            });
        });
    });

    describe('focusTerminal', () => {
        it('should focus tmux pane', async () => {
            mockExec.mockImplementation((cmd: any, callback: any) => callback(null, { stdout: '', stderr: '' }));

            const result = await manager.focusTerminal({
                type: 'tmux',
                identifier: 'session:1.1',
                tty: '/dev/ttys001'
            });

            expect(result).toBe(true);
            expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('tmux switch-client -t session:1.1'), expect.any(Function));
        });

        it('should focus iTerm2 session', async () => {
            mockExec.mockImplementation((cmd: any, callback: any) => callback(null, { stdout: 'true', stderr: '' }));

            const result = await manager.focusTerminal({
                type: 'iterm2',
                identifier: '/dev/ttys001',
                tty: '/dev/ttys001'
            });

            expect(result).toBe(true);
            // Verify AppleScript contains activate and selection logic
            // Note: in Jest mocks, calls are arrays [args]
            const calls = (mockExec as any).mock.calls;
            const itermCall = calls.find((args: any[]) => args[0].includes('tell application "iTerm"'));

            expect(itermCall).toBeDefined();
            if (itermCall) {
                expect(itermCall[0]).toContain('activate');
                expect(itermCall[0]).toContain('select s');
            }
        });

        it('should focus Terminal.app window', async () => {
            mockExec.mockImplementation((cmd: any, callback: any) => callback(null, { stdout: 'true', stderr: '' }));

            const result = await manager.focusTerminal({
                type: 'terminal-app',
                identifier: '/dev/ttys001',
                tty: '/dev/ttys001'
            });

            expect(result).toBe(true);
            const calls = (mockExec as any).mock.calls;
            const terminalCall = calls.find((args: any[]) => args[0].includes('tell application "Terminal"'));

            expect(terminalCall).toBeDefined();
            if (terminalCall) {
                expect(terminalCall[0]).toContain('activate');
                expect(terminalCall[0]).toContain('set selected tab of w to t');
            }
        });
    });
});
