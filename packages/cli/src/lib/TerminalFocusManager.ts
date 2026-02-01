import { exec } from 'child_process';
import { promisify } from 'util';
import { getProcessTty } from '../util/process';

const execAsync = promisify(exec);

export interface TerminalLocation {
    type: 'tmux' | 'iterm2' | 'terminal-app' | 'unknown';
    identifier: string; // e.g., "session:window.pane" for tmux, or TTY for others
    tty: string;        // e.g., "/dev/ttys030"
}

export class TerminalFocusManager {
    /**
     * Find the terminal location (emulator info) for a given process ID
     */
    async findTerminal(pid: number): Promise<TerminalLocation | null> {
        const ttyShort = getProcessTty(pid);

        // If no TTY or invalid, we can't find the terminal
        if (!ttyShort || ttyShort === '?') {
            return null;
        }

        const fullTty = `/dev/${ttyShort}`;

        // 1. Check tmux (most specific if running inside it)
        const tmuxLocation = await this.findTmuxPane(fullTty);
        if (tmuxLocation) return tmuxLocation;

        // 2. Check iTerm2
        const itermLocation = await this.findITerm2Session(fullTty);
        if (itermLocation) return itermLocation;

        // 3. Check Terminal.app
        const terminalAppLocation = await this.findTerminalAppWindow(fullTty);
        if (terminalAppLocation) return terminalAppLocation;

        // 4. Fallback: we know the TTY but not the emulator wrapper
        return {
            type: 'unknown',
            identifier: '',
            tty: fullTty
        };
    }

    /**
     * Focus the terminal identified by the location
     */
    async focusTerminal(location: TerminalLocation): Promise<boolean> {
        try {
            switch (location.type) {
                case 'tmux':
                    return await this.focusTmuxPane(location.identifier);
                case 'iterm2':
                    return await this.focusITerm2Session(location.tty);
                case 'terminal-app':
                    return await this.focusTerminalAppWindow(location.tty);
                default:
                    return false;
            }
        } catch (error) {
            return false;
        }
    }

    private async findTmuxPane(tty: string): Promise<TerminalLocation | null> {
        try {
            // List all panes with their TTYs and identifiers
            // Format: /dev/ttys001|my-session:1.1
            // using | as separator to handle spaces in session names
            const { stdout } = await execAsync("tmux list-panes -a -F '#{pane_tty}|#{session_name}:#{window_index}.#{pane_index}'");

            const lines = stdout.trim().split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                const [paneTty, identifier] = line.split('|');
                if (paneTty === tty && identifier) {
                    return {
                        type: 'tmux',
                        identifier,
                        tty
                    };
                }
            }
        } catch (error) {
            // tmux might not be installed or running
        }
        return null;
    }

    private async findITerm2Session(tty: string): Promise<TerminalLocation | null> {
        try {
            // Check if iTerm2 is running first to avoid launching it
            const { stdout: isRunning } = await execAsync('pgrep -x iTerm2 || echo "no"');
            if (isRunning.trim() === "no") return null;

            const script = `
        tell application "iTerm"
          repeat with w in windows
            repeat with t in tabs of w
              repeat with s in sessions of t
                if tty of s is "${tty}" then
                  return "found"
                end if
              end repeat
            end repeat
          end repeat
        end tell
      `;

            const { stdout } = await execAsync(`osascript -e '${script}'`);
            if (stdout.trim() === "found") {
                return {
                    type: 'iterm2',
                    identifier: tty,
                    tty
                };
            }
        } catch (error) {
            // iTerm2 not found or script failed
        }
        return null;
    }

    private async findTerminalAppWindow(tty: string): Promise<TerminalLocation | null> {
        try {
            // Check if Terminal is running
            const { stdout: isRunning } = await execAsync('pgrep -x Terminal || echo "no"');
            if (isRunning.trim() === "no") return null;

            const script = `
        tell application "Terminal"
          repeat with w in windows
            repeat with t in tabs of w
              if tty of t is "${tty}" then
                return "found"
              end if
            end repeat
          end repeat
        end tell
      `;

            const { stdout } = await execAsync(`osascript -e '${script}'`);
            if (stdout.trim() === "found") {
                return {
                    type: 'terminal-app',
                    identifier: tty,
                    tty
                };
            }
        } catch (error) {
            // Terminal not found or script failed
        }
        return null;
    }

    private async focusTmuxPane(identifier: string): Promise<boolean> {
        try {
            await execAsync(`tmux switch-client -t ${identifier}`);
            return true;
        } catch (error) {
            return false;
        }
    }

    private async focusITerm2Session(tty: string): Promise<boolean> {
        const script = `
       tell application "iTerm"
         activate
         repeat with w in windows
           repeat with t in tabs of w
             repeat with s in sessions of t
               if tty of s is "${tty}" then
                 select s
                 return "true"
               end if
             end repeat
           end repeat
         end repeat
       end tell
     `;
        const { stdout } = await execAsync(`osascript -e '${script}'`);
        return stdout.trim() === "true";
    }

    private async focusTerminalAppWindow(tty: string): Promise<boolean> {
        const script = `
       tell application "Terminal"
         activate
         repeat with w in windows
           repeat with t in tabs of w
             if tty of t is "${tty}" then
               set index of w to 1
               set selected tab of w to t
               return "true"
             end if
           end repeat
         end repeat
       end tell
    `;
        const { stdout } = await execAsync(`osascript -e '${script}'`);
        return stdout.trim() === "true";
    }
}
