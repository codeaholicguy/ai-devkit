import { execFile } from "child_process";
import { promisify } from "util";
import { escapeAppleScript } from "../../utils/applescript.js";
import { TerminalType, type TerminalBackend } from "../types.js";
import { appleScriptKeyAction, isProcessRunning, sleep } from "./shared.js";

const execFileAsync = promisify(execFile);

function tabScript(tty: string, command: string): string {
  return `
tell application "Terminal"
  set targetTab to missing value
  repeat with w in windows
    repeat with i from 1 to count of tabs of w
      set t to tab i of w
      if tty of t is "${escapeAppleScript(tty)}" then
        set targetTab to t
        exit repeat
      end if
    end repeat
    if targetTab is not missing value then exit repeat
  end repeat
  if targetTab is missing value then return "not_found"
  ${command}
end tell
return "ok"`;
}

export const terminalAppBackend: TerminalBackend = {
  type: TerminalType.TERMINAL_APP,
  label: "Terminal.app",

  async find(tty) {
    try {
      if (!(await isProcessRunning("Terminal"))) return null;
      const script = `
        tell application "Terminal"
          repeat with w in windows
            repeat with t in tabs of w
              if tty of t is "${escapeAppleScript(tty)}" then
                return "found"
              end if
            end repeat
          end repeat
        end tell
      `;
      const { stdout } = await execFileAsync("osascript", ["-e", script]);
      return stdout.trim() === "found"
        ? { type: TerminalType.TERMINAL_APP, identifier: tty, tty }
        : null;
    } catch {
      return null;
    }
  },

  async focus(location) {
    const script = `
       tell application "Terminal"
         activate
         repeat with w in windows
           repeat with t in tabs of w
             if tty of t is "${escapeAppleScript(location.tty)}" then
               set index of w to 1
               set selected tab of w to t
               return "true"
             end if
           end repeat
         end repeat
       end tell
    `;
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    return stdout.trim() === "true";
  },

  async send(location, message) {
    const textScript = tabScript(
      location.tty,
      `do script "${escapeAppleScript(message)}" in targetTab`,
    );
    const { stdout: textResult } = await execFileAsync("osascript", ["-e", textScript]);
    if (textResult.trim() !== "ok") {
      throw new Error(`Terminal.app tab not found for TTY ${location.tty}`);
    }
    await sleep(150);
    const enterScript = tabScript(location.tty, 'do script "" in targetTab');
    const { stdout: enterResult } = await execFileAsync("osascript", ["-e", enterScript]);
    if (enterResult.trim() !== "ok") {
      throw new Error(
        `Terminal.app tab disappeared before Enter could be sent for TTY ${location.tty}`,
      );
    }
  },

  async sendKey(location, key) {
    const script = `
tell application "Terminal"
  set targetTab to missing value
  set targetWindow to missing value
  repeat with w in windows
    repeat with i from 1 to count of tabs of w
      set t to tab i of w
      if tty of t is "${escapeAppleScript(location.tty)}" then
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
tell application "System Events" to ${appleScriptKeyAction(key)}
return "ok"`;
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    if (stdout.trim() !== "ok") {
      throw new Error(`Terminal.app tab not found for TTY ${location.tty}`);
    }
  },
};
