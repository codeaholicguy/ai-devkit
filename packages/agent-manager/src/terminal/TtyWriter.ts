import { execFile } from 'child_process';
import { promisify } from 'util';
import type { TerminalLocation } from './TerminalFocusManager';
import { TerminalType } from './TerminalFocusManager';
import { escapeAppleScript } from '../utils/applescript';

const execFileAsync = promisify(execFile);

export class TtyWriter {
    /**
     * Send a message as keyboard input to a terminal session.
     *
     * Dispatches to the correct mechanism based on terminal type:
     * - tmux: `tmux send-keys`
     * - iTerm2: Two separate AppleScript `write text` calls (text then newline)
     * - Terminal.app: Two separate AppleScript `do script` calls (text then newline)
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
        // Send text and Enter as two separate calls so that Enter arrives
        // outside of bracketed paste mode. When the inner application (e.g.
        // Claude Code) has bracketed paste enabled, tmux wraps the send-keys
        // payload in paste brackets — if Enter is included, it gets swallowed
        // as part of the paste instead of acting as a submit action.
        await execFileAsync('tmux', ['send-keys', '-t', identifier, '-l', message]);
        await new Promise((resolve) => setTimeout(resolve, 150));
        await execFileAsync('tmux', ['send-keys', '-t', identifier, 'Enter']);
    }

    /**
     * Build an AppleScript that finds an iTerm2 session by TTY and runs a
     * command against it. The `sessionCommand` is inserted inside a
     * `tell targetSession` block.
     */
    private static iterm2SessionScript(tty: string, sessionCommand: string): string {
        return `
tell application "iTerm"
  set targetSession to missing value
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if tty of s is "${tty}" then
          set targetSession to s
          exit repeat
        end if
      end repeat
      if targetSession is not missing value then exit repeat
    end repeat
    if targetSession is not missing value then exit repeat
  end repeat
  if targetSession is missing value then return "not_found"
  tell targetSession to ${sessionCommand}
end tell
return "ok"`;
    }

    private static async sendViaITerm2(tty: string, message: string): Promise<void> {
        const escaped = escapeAppleScript(message);
        // Send text and Enter as two separate write text calls so the newline
        // is delivered outside the bracketed paste sequence of the message body.
        // iTerm2 appends the newline after the paste-end marker (\e[201~), so
        // the inner TUI (Claude Code, Codex) sees it as a real submit action.
        const textScript = TtyWriter.iterm2SessionScript(tty, `write text "${escaped}" newline no`);

        const { stdout: textResult } = await execFileAsync('osascript', ['-e', textScript]);
        if (textResult.trim() !== 'ok') {
            throw new Error(`iTerm2 session not found for TTY ${tty}`);
        }

        // Wait for the paste to complete before sending Enter separately
        await new Promise((resolve) => setTimeout(resolve, 150));

        const enterScript = TtyWriter.iterm2SessionScript(tty, 'write text "" newline yes');
        const { stdout: enterResult } = await execFileAsync('osascript', ['-e', enterScript]);
        if (enterResult.trim() !== 'ok') {
            throw new Error(`iTerm2 session disappeared before Enter could be sent for TTY ${tty}`);
        }
    }

    private static async sendViaTerminalApp(tty: string, message: string): Promise<void> {
        const escaped = escapeAppleScript(message);
        // Use Terminal.app's `do script` to send text to the correct tab by TTY.
        // We avoid System Events `keystroke` + `key code 36` because it requires
        // accessibility permissions and unreliably delivers the Return key.
        //
        // `do script` with `in` targets a specific tab without opening a new one.
        // We send text and Enter as two separate calls so the newline arrives
        // outside of bracketed paste mode — same pattern as iTerm2 and tmux.
        const textScript = `
tell application "Terminal"
  set targetTab to missing value
  repeat with w in windows
    repeat with i from 1 to count of tabs of w
      set t to tab i of w
      if tty of t is "${tty}" then
        set targetTab to t
        exit repeat
      end if
    end repeat
    if targetTab is not missing value then exit repeat
  end repeat
  if targetTab is missing value then return "not_found"
  do script "${escaped}" in targetTab
end tell
return "ok"`;

        const { stdout: textResult } = await execFileAsync('osascript', ['-e', textScript]);
        if (textResult.trim() !== 'ok') {
            throw new Error(`Terminal.app tab not found for TTY ${tty}`);
        }

        // Wait for the text to be delivered before sending Enter
        await new Promise((resolve) => setTimeout(resolve, 150));

        const enterScript = `
tell application "Terminal"
  set targetTab to missing value
  repeat with w in windows
    repeat with i from 1 to count of tabs of w
      set t to tab i of w
      if tty of t is "${tty}" then
        set targetTab to t
        exit repeat
      end if
    end repeat
    if targetTab is not missing value then exit repeat
  end repeat
  if targetTab is missing value then return "not_found"
  do script "" in targetTab
end tell
return "ok"`;

        const { stdout: enterResult } = await execFileAsync('osascript', ['-e', enterScript]);
        if (enterResult.trim() !== 'ok') {
            throw new Error(`Terminal.app tab disappeared before Enter could be sent for TTY ${tty}`);
        }
    }
}
