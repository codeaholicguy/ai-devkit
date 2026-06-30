import { execFile } from 'child_process';
import { promisify } from 'util';
import type { TerminalLocation } from './TerminalFocusManager.js';
import { TerminalType } from './TerminalFocusManager.js';
import { escapeAppleScript } from '../utils/applescript.js';

const execFileAsync = promisify(execFile);

/**
 * Carriage return byte (0x0d). Sent as a fixed discrete argv element with
 * `--no-paste` to deliver Enter literally (shell equivalent: $'\x0d').
 */
const CARRIAGE_RETURN = '\x0d';

/**
 * Escape byte (0x1b). Recognized by `sendKey` and translated to the
 * backend-native representation (`Escape` for tmux, `key code 53` for
 * AppleScript, the literal byte for WezTerm).
 */
const ESCAPE_BYTE = '\x1b';

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
            case TerminalType.WEZTERM:
                return TtyWriter.sendViaWezterm(location.identifier, message);
            case TerminalType.ITERM2:
                return TtyWriter.sendViaITerm2(location.tty, message);
            case TerminalType.TERMINAL_APP:
                return TtyWriter.sendViaTerminalApp(location.tty, message);
            default:
                throw new Error(
                    `Cannot send input: unsupported terminal type "${location.type}". ` +
                    'Supported: tmux, WezTerm, iTerm2, Terminal.app.'
                );
        }
    }

    /**
     * Send a single raw key (e.g. "1", "Enter", "Up") to the terminal as a
     * keystroke — bypassing bracketed paste and without auto-appending Enter.
     *
     * Use this when the target TUI distinguishes between typed text and raw
     * keypresses (e.g. an `AskUserQuestion` picker that selects on digit-key
     * press, not on a pasted digit followed by Enter).
     *
     * - tmux: `tmux send-keys -t <id> <key>` — direct keystroke, no paste buffer.
     * - WezTerm: `wezterm cli send-text --pane-id <id> --no-paste <key>`.
     * - iTerm2 / Terminal.app: AppleScript via System Events. Requires
     *   Accessibility permissions.
     */
    static async sendKey(location: TerminalLocation, key: string): Promise<void> {
        switch (location.type) {
            case TerminalType.TMUX:
                return TtyWriter.sendKeyViaTmux(location.identifier, key);
            case TerminalType.WEZTERM:
                return TtyWriter.sendKeyViaWezterm(location.identifier, key);
            case TerminalType.ITERM2:
                return TtyWriter.sendKeyViaITerm2(location.tty, key);
            case TerminalType.TERMINAL_APP:
                return TtyWriter.sendKeyViaTerminalApp(location.tty, key);
            default:
                throw new Error(
                    `Cannot send key: unsupported terminal type "${location.type}". ` +
                    'Supported: tmux, WezTerm, iTerm2, Terminal.app.'
                );
        }
    }

    private static async sendKeyViaTmux(identifier: string, key: string): Promise<void> {
        // tmux send-keys interprets named keys (Enter, Up, Escape, ...) and
        // passes literals through. No bracketed paste, no auto-Enter.
        const arg = key === ESCAPE_BYTE ? 'Escape' : key;
        await execFileAsync('tmux', ['send-keys', '-t', identifier, arg]);
    }

    private static async sendKeyViaWezterm(paneId: string, key: string): Promise<void> {
        // --no-paste delivers the key bytes literally outside bracketed-paste
        // markers; the TUI sees a raw keystroke. For Esc (`\x1b`), wezterm
        // accepts the byte directly.
        await execFileAsync('wezterm', [
            'cli', 'send-text', '--pane-id', paneId, '--no-paste', key,
        ]);
    }

    private static async sendKeyViaITerm2(tty: string, key: string): Promise<void> {
        // Focus the target session, then press the key via System Events so the
        // inner TUI sees a raw keystroke (not a bracketed-paste text run).
        const action = appleScriptKeyAction(key);
        const script = `
tell application "iTerm"
  set targetSession to missing value
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if tty of s is "${tty}" then
          set targetSession to s
          set frontmost of w to true
          tell t to select
          tell s to select
          exit repeat
        end if
      end repeat
      if targetSession is not missing value then exit repeat
    end repeat
    if targetSession is not missing value then exit repeat
  end repeat
  if targetSession is missing value then return "not_found"
  activate
end tell
tell application "System Events" to ${action}
return "ok"`;

        const { stdout } = await execFileAsync('osascript', ['-e', script]);
        if (stdout.trim() !== 'ok') {
            throw new Error(`iTerm2 session not found for TTY ${tty}`);
        }
    }

    private static async sendKeyViaTerminalApp(tty: string, key: string): Promise<void> {
        const action = appleScriptKeyAction(key);
        const script = `
tell application "Terminal"
  set targetTab to missing value
  set targetWindow to missing value
  repeat with w in windows
    repeat with i from 1 to count of tabs of w
      set t to tab i of w
      if tty of t is "${tty}" then
        set targetTab to t
        set targetWindow to w
        exit repeat
      end if
    end repeat
    if targetTab is not missing value then exit repeat
  end repeat
  if targetTab is missing value then return "not_found"
  set selected of targetTab to true
  set frontmost of targetWindow to true
  activate
end tell
tell application "System Events" to ${action}
return "ok"`;

        const { stdout } = await execFileAsync('osascript', ['-e', script]);
        if (stdout.trim() !== 'ok') {
            throw new Error(`Terminal.app tab not found for TTY ${tty}`);
        }
    }

    private static async sendViaWezterm(paneId: string, message: string): Promise<void> {
        // Two explicit CLI calls, mirroring the text-then-Enter convention used
        // by tmux / iTerm2 / Terminal.app so a bracketed-paste-aware TUI still
        // sees Enter as a submit.
        //
        // Step 1 (text): write the message to stdin so prompt contents are not
        // exposed through process arguments. execFile still spawns wezterm
        // directly (no shell), so shell metacharacters remain inert.
        // Step 2 (Enter): pass a fixed carriage return (0x0d) as a discrete
        // argv element (the JS char '\x0d') with --no-paste, so the CR is
        // delivered literally rather than wrapped in paste brackets. The
        // equivalent shell command is:
        //   wezterm cli send-text --pane-id <id> --no-paste $'\x0d'
        // (ANSI-C quoting, note the leading $).
        await TtyWriter.execFileWithInput('wezterm', [
            'cli', 'send-text', '--pane-id', paneId,
        ], message);
        await new Promise((resolve) => setTimeout(resolve, 150));
        await execFileAsync('wezterm', [
            'cli', 'send-text', '--pane-id', paneId, '--no-paste', CARRIAGE_RETURN,
        ]);
    }

    private static async sendViaTmux(identifier: string, message: string): Promise<void> {
        // Paste the message body using tmux bracketed paste, then send Enter as
        // a separate key so the inner TUI treats it as submission rather than
        // pasted content.
        const bufferName = `ai-devkit-send-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await TtyWriter.execFileWithInput('tmux', ['load-buffer', '-b', bufferName, '-'], message);
        await execFileAsync('tmux', ['paste-buffer', '-t', identifier, '-b', bufferName, '-p', '-d']);
        await new Promise((resolve) => setTimeout(resolve, 150));
        await execFileAsync('tmux', ['send-keys', '-t', identifier, 'Enter']);
    }

    private static async execFileWithInput(command: string, args: string[], input: string): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const child = execFile(command, args, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
            if (!child.stdin) {
                reject(new Error(`Cannot write stdin to ${command}`));
                return;
            }
            child.stdin.end(input);
        });
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

/**
 * AppleScript `keystroke` only delivers typeable characters; non-typeable
 * keys (Esc, arrows, F-keys, …) must be sent via `key code <N>`. Add more
 * mappings here as new special keys are needed.
 */
function appleScriptKeyAction(key: string): string {
    if (key === ESCAPE_BYTE) return 'key code 53';
    return `keystroke "${escapeAppleScript(key)}"`;
}
