import { execFile } from "child_process";
import { promisify } from "util";
import { escapeAppleScript } from "../../utils/applescript.js";
import { TerminalType, type TerminalBackend } from "../types.js";
import { appleScriptKeyAction, isProcessRunning, sleep } from "./shared.js";

const execFileAsync = promisify(execFile);

function sessionScript(tty: string, sessionCommand: string): string {
  return `
tell application "iTerm"
  set targetSession to missing value
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if tty of s is "${escapeAppleScript(tty)}" then
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

export const iterm2Backend: TerminalBackend = {
  type: TerminalType.ITERM2,
  label: "iTerm2",

  async find(tty) {
    try {
      if (!(await isProcessRunning("iTerm2"))) return null;
      const script = `
        tell application "iTerm"
          repeat with w in windows
            repeat with t in tabs of w
              repeat with s in sessions of t
                if tty of s is "${escapeAppleScript(tty)}" then
                  return "found"
                end if
              end repeat
            end repeat
          end repeat
        end tell
      `;
      const { stdout } = await execFileAsync("osascript", ["-e", script]);
      return stdout.trim() === "found" ? { type: TerminalType.ITERM2, identifier: tty, tty } : null;
    } catch {
      return null;
    }
  },

  async focus(location) {
    const script = `
       tell application "iTerm"
         activate
         repeat with w in windows
           repeat with t in tabs of w
             repeat with s in sessions of t
               if tty of s is "${escapeAppleScript(location.tty)}" then
                 select s
                 return "true"
               end if
             end repeat
           end repeat
         end repeat
       end tell
     `;
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    return stdout.trim() === "true";
  },

  async send(location, message) {
    const textScript = sessionScript(
      location.tty,
      `write text "${escapeAppleScript(message)}" newline no`,
    );
    const { stdout: textResult } = await execFileAsync("osascript", ["-e", textScript]);
    if (textResult.trim() !== "ok") {
      throw new Error(`iTerm2 session not found for TTY ${location.tty}`);
    }
    await sleep(150);
    const enterScript = sessionScript(location.tty, 'write text "" newline yes');
    const { stdout: enterResult } = await execFileAsync("osascript", ["-e", enterScript]);
    if (enterResult.trim() !== "ok") {
      throw new Error(
        `iTerm2 session disappeared before Enter could be sent for TTY ${location.tty}`,
      );
    }
  },

  async sendKey(location, key) {
    const script = `
tell application "iTerm"
  set targetSession to missing value
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if tty of s is "${escapeAppleScript(location.tty)}" then
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
tell application "System Events" to ${appleScriptKeyAction(key)}
return "ok"`;
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    if (stdout.trim() !== "ok") {
      throw new Error(`iTerm2 session not found for TTY ${location.tty}`);
    }
  },
};
