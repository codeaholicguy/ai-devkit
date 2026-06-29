import { execFile } from 'child_process';
import { promisify } from 'util';
import { getProcessTty } from '../utils/process.js';
import { escapeAppleScript } from '../utils/applescript.js';

const execFileAsync = promisify(execFile);

export enum TerminalType {
    TMUX = 'tmux',
    WEZTERM = 'wezterm',
    ITERM2 = 'iterm2',
    TERMINAL_APP = 'terminal-app',
    UNKNOWN = 'unknown',
}

export interface TerminalLocation {
    type: TerminalType;
    identifier: string; // e.g., "session:window.pane" for tmux, WezTerm pane id, or TTY for others
    tty: string;        // e.g., "/dev/ttys030"
}

/**
 * Subset of a `wezterm cli list --format json` entry. Only `pane_id` and
 * `tty_name` are read; extra fields are ignored so schema additions across
 * WezTerm versions don't break parsing. (The TTY is exposed as `tty_name` in
 * the JSON, not `tty`.)
 */
interface WeztermPaneEntry {
    pane_id?: number;
    tty_name?: string | null;
}

/**
 * Optional trace sink. When provided to {@link TerminalFocusManager}, each
 * discovery/focus step reports a human-readable line so callers (e.g. the
 * `agent open --debug` command) can inspect the matching/focus decision path.
 */
export type TerminalDebugLogger = (message: string) => void;

export class TerminalFocusManager {
    constructor(private readonly debug?: TerminalDebugLogger) {}

    /**
     * Find the terminal location (emulator info) for a given process ID
     */
    async findTerminal(pid: number): Promise<TerminalLocation | null> {
        const ttyShort = getProcessTty(pid);

        // If no TTY or invalid, we can't find the terminal
        if (!ttyShort || ttyShort === '?') {
            this.debug?.(`findTerminal(pid=${pid}): no usable TTY, cannot resolve terminal`);
            return null;
        }

        const fullTty = `/dev/${ttyShort}`;
        this.debug?.(`findTerminal(pid=${pid}): resolving terminal for ${fullTty}`);

        // 1. Check tmux (most specific if running inside it)
        const tmuxLocation = await this.findTmuxPane(fullTty);
        if (tmuxLocation) {
            this.debug?.(`findTerminal: matched tmux (identifier=${tmuxLocation.identifier})`);
            return tmuxLocation;
        }
        this.debug?.('findTerminal: tmux no match');

        // 2. Check WezTerm (cross-platform, via its CLI — no AppleScript)
        const weztermLocation = await this.findWeztermPane(fullTty);
        if (weztermLocation) {
            this.debug?.(`findTerminal: matched wezterm (pane_id=${weztermLocation.identifier})`);
            return weztermLocation;
        }
        this.debug?.('findTerminal: wezterm no match');

        // 3. Check iTerm2
        const itermLocation = await this.findITerm2Session(fullTty);
        if (itermLocation) {
            this.debug?.(`findTerminal: matched iTerm2 (tty=${itermLocation.tty})`);
            return itermLocation;
        }
        this.debug?.('findTerminal: iTerm2 no match');

        // 4. Check Terminal.app
        const terminalAppLocation = await this.findTerminalAppWindow(fullTty);
        if (terminalAppLocation) {
            this.debug?.(`findTerminal: matched Terminal.app (tty=${terminalAppLocation.tty})`);
            return terminalAppLocation;
        }
        this.debug?.('findTerminal: Terminal.app no match');

        // 5. Fallback: we know the TTY but not the emulator wrapper
        this.debug?.('findTerminal: no emulator matched; returning UNKNOWN');
        return {
            type: TerminalType.UNKNOWN,
            identifier: '',
            tty: fullTty
        };
    }

    /**
     * Focus the terminal identified by the location
     */
    async focusTerminal(location: TerminalLocation): Promise<boolean> {
        this.debug?.(`focusTerminal: focusing ${location.type} (identifier=${location.identifier}, tty=${location.tty})`);
        let success = false;
        try {
            switch (location.type) {
                case TerminalType.TMUX:
                    success = await this.focusTmuxPane(location.identifier);
                    break;
                case TerminalType.WEZTERM:
                    success = await this.focusWeztermPane(location.identifier);
                    break;
                case TerminalType.ITERM2:
                    success = await this.focusITerm2Session(location.tty);
                    break;
                case TerminalType.TERMINAL_APP:
                    success = await this.focusTerminalAppWindow(location.tty);
                    break;
                default:
                    success = false;
            }
        } catch {
            success = false;
        }
        this.debug?.(`focusTerminal: ${success ? 'succeeded' : 'failed'} for ${location.type}`);
        return success;
    }

    private async findWeztermPane(tty: string): Promise<TerminalLocation | null> {
        try {
            const { stdout } = await execFileAsync('wezterm', [
                'cli', 'list', '--format', 'json',
            ]);

            const panes = JSON.parse(stdout) as WeztermPaneEntry[];
            if (!Array.isArray(panes)) return null;

            for (const pane of panes) {
                if (
                    pane &&
                    typeof pane.tty_name === 'string' &&
                    pane.tty_name === tty &&
                    pane.pane_id != null
                ) {
                    return {
                        type: TerminalType.WEZTERM,
                        identifier: String(pane.pane_id),
                        tty,
                    };
                }
            }
        } catch {
            // wezterm not installed, not running, or returned invalid JSON
        }
        return null;
    }

    private async focusWeztermPane(paneId: string): Promise<boolean> {
        try {
            await execFileAsync('wezterm', ['cli', 'activate-pane', '--pane-id', paneId]);
            return true;
        } catch {
            return false;
        }
    }

    private async findTmuxPane(tty: string): Promise<TerminalLocation | null> {
        try {
            const { stdout } = await execFileAsync('tmux', [
                'list-panes', '-a', '-F', '#{pane_tty}|#{session_name}:#{window_index}.#{pane_index}'
            ]);

            const lines = stdout.trim().split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                const [paneTty, identifier] = line.split('|');
                if (paneTty === tty && identifier) {
                    return {
                        type: TerminalType.TMUX,
                        identifier,
                        tty
                    };
                }
            }
        } catch {
            // tmux might not be installed or running
        }
        return null;
    }

    private async findITerm2Session(tty: string): Promise<TerminalLocation | null> {
        try {
            // Check if iTerm2 is running first to avoid launching it.
            if (!await this.isProcessRunning('iTerm2')) return null;
        } catch {
            return null;
        }

        try {
            const escapedTty = escapeAppleScript(tty);
            const script = `
        tell application "iTerm"
          repeat with w in windows
            repeat with t in tabs of w
              repeat with s in sessions of t
                if tty of s is "${escapedTty}" then
                  return "found"
                end if
              end repeat
            end repeat
          end repeat
        end tell
      `;

            const { stdout } = await execFileAsync('osascript', ['-e', script]);
            if (stdout.trim() === "found") {
                return {
                    type: TerminalType.ITERM2,
                    identifier: tty,
                    tty
                };
            }
        } catch {
            // iTerm2 script failed
        }
        return null;
    }

    private async findTerminalAppWindow(tty: string): Promise<TerminalLocation | null> {
        try {
            // Check if Terminal.app is running
            if (!await this.isProcessRunning('Terminal')) return null;
        } catch {
            return null;
        }

        try {
            const escapedTty = escapeAppleScript(tty);
            const script = `
        tell application "Terminal"
          repeat with w in windows
            repeat with t in tabs of w
              if tty of t is "${escapedTty}" then
                return "found"
              end if
            end repeat
          end repeat
        end tell
      `;

            const { stdout } = await execFileAsync('osascript', ['-e', script]);
            if (stdout.trim() === "found") {
                return {
                    type: TerminalType.TERMINAL_APP,
                    identifier: tty,
                    tty
                };
            }
        } catch {
            // Terminal.app script failed
        }
        return null;
    }

    private async isProcessRunning(name: string): Promise<boolean> {
        const { stdout } = await execFileAsync('ps', ['-Axo', 'comm']);
        return stdout
            .split('\n')
            .map((line) => line.trim())
            .some((command) => command === name || command.endsWith(`/${name}`));
    }

    private async focusTmuxPane(identifier: string): Promise<boolean> {
        try {
            await execFileAsync('tmux', ['switch-client', '-t', identifier]);
            return true;
        } catch {
            return false;
        }
    }

    private async focusITerm2Session(tty: string): Promise<boolean> {
        const escapedTty = escapeAppleScript(tty);
        const script = `
       tell application "iTerm"
         activate
         repeat with w in windows
           repeat with t in tabs of w
             repeat with s in sessions of t
               if tty of s is "${escapedTty}" then
                 select s
                 return "true"
               end if
             end repeat
           end repeat
         end repeat
       end tell
     `;
        const { stdout } = await execFileAsync('osascript', ['-e', script]);
        return stdout.trim() === "true";
    }

    private async focusTerminalAppWindow(tty: string): Promise<boolean> {
        const escapedTty = escapeAppleScript(tty);
        const script = `
       tell application "Terminal"
         activate
         repeat with w in windows
           repeat with t in tabs of w
             if tty of t is "${escapedTty}" then
               set index of w to 1
               set selected tab of w to t
               return "true"
             end if
           end repeat
         end repeat
       end tell
    `;
        const { stdout } = await execFileAsync('osascript', ['-e', script]);
        return stdout.trim() === "true";
    }
}
