import { execFile } from 'child_process';
import { promisify } from 'util';
import type { TerminalLocation } from './TerminalFocusManager';
import { TerminalType } from './TerminalFocusManager';

const execFileAsync = promisify(execFile);

/**
 * Escape a string for safe use inside an AppleScript double-quoted string.
 * Backslashes and double quotes must be escaped.
 */
function escapeAppleScript(text: string): string {
    return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export class TtyWriter {
    /**
     * Send a message as keyboard input to a terminal session.
     *
     * Dispatches to the correct mechanism based on terminal type:
     * - tmux: `tmux send-keys`
     * - iTerm2: AppleScript `write text`
     * - Terminal.app: System Events `keystroke` + `key code 36` (Return)
     *
     * All AppleScript is executed via `execFile('osascript', ['-e', script])`
     * to avoid shell interpolation and command injection.
     *
     * @param location Terminal location from TerminalFocusManager.findTerminal()
     * @param message Text to send
     * @throws Error if terminal type is unsupported or send fails
     */
    static async send(location: TerminalLocation, message: string): Promise<void> {
        switch (location.type) {
            case TerminalType.TMUX:
                return TtyWriter.sendViaTmux(location.identifier, message);
            case TerminalType.ITERM2:
                return TtyWriter.sendViaITerm2(location.tty, message);
            case TerminalType.TERMINAL_APP:
                return TtyWriter.sendViaTerminalApp(location.tty, message);
            default:
                throw new Error(
                    `Cannot send input: unsupported terminal type "${location.type}". ` +
                    'Supported: tmux, iTerm2, Terminal.app.'
                );
        }
    }

    private static async sendViaTmux(identifier: string, message: string): Promise<void> {
        await execFileAsync('tmux', ['send-keys', '-t', identifier, message, 'Enter']);
    }

    private static async sendViaITerm2(tty: string, message: string): Promise<void> {
        const escaped = escapeAppleScript(message);
        const script = `
tell application "iTerm"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if tty of s is "${tty}" then
          tell s to write text "${escaped}"
          return "ok"
        end if
      end repeat
    end repeat
  end repeat
end tell
return "not_found"`;

        const { stdout } = await execFileAsync('osascript', ['-e', script]);
        if (stdout.trim() !== 'ok') {
            throw new Error(`iTerm2 session not found for TTY ${tty}`);
        }
    }

    private static async sendViaTerminalApp(tty: string, message: string): Promise<void> {
        const escaped = escapeAppleScript(message);
        // Use System Events keystroke to type into the foreground process,
        // NOT Terminal.app's "do script" which runs a new shell command.
        // First activate Terminal and select the correct tab, then type via System Events.
        const script = `
tell application "Terminal"
  set targetFound to false
  repeat with w in windows
    repeat with i from 1 to count of tabs of w
      set t to tab i of w
      if tty of t is "${tty}" then
        set selected tab of w to t
        set index of w to 1
        activate
        set targetFound to true
        exit repeat
      end if
    end repeat
    if targetFound then exit repeat
  end repeat
  if not targetFound then return "not_found"
end tell
delay 0.1
tell application "System Events"
  tell process "Terminal"
    keystroke "${escaped}"
    key code 36
  end tell
end tell
return "ok"`;

        const { stdout } = await execFileAsync('osascript', ['-e', script]);
        if (stdout.trim() !== 'ok') {
            throw new Error(`Terminal.app tab not found for TTY ${tty}`);
        }
    }
}
