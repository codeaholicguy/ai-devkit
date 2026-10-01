import { execFile } from "child_process";
import { writeFile } from "fs/promises";
import { promisify } from "util";
import { escapeAppleScript } from "../../utils/applescript.js";
import { getProcessCwdsAsync } from "../../utils/process.js";
import { TerminalType, type TerminalBackend, type TerminalLocation } from "../types.js";
import { CARRIAGE_RETURN, isProcessName, sleep } from "./shared.js";

const execFileAsync = promisify(execFile);

/** Separates fields in AppleScript output; never part of an id, title or path. */
const FIELD_SEPARATOR = "\x1f";
const MARKER_POLL_ATTEMPTS = 10;
const MARKER_POLL_INTERVAL_MS = 50;

interface GhosttyTerminal {
  id: string;
  name: string;
  workingDirectory: string;
}

interface ProcessRow {
  pid: number;
  ppid: number;
  tty: string;
  comm: string;
}

async function listProcesses(): Promise<ProcessRow[]> {
  const { stdout } = await execFileAsync("ps", ["-Axo", "pid=,ppid=,tty=,comm="]);
  const rows: ProcessRow[] = [];
  for (const line of stdout.split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    if (match) {
      rows.push({ pid: Number(match[1]), ppid: Number(match[2]), tty: match[3], comm: match[4] });
    }
  }
  return rows;
}

async function listTerminals(): Promise<GhosttyTerminal[]> {
  const script = `
tell application "Ghostty"
  set out to ""
  repeat with t in terminals
    set out to out & (id of t) & (character id 31) & (name of t) & (character id 31) & (working directory of t) & linefeed
  end repeat
  return out
end tell`;
  const { stdout } = await execFileAsync("osascript", ["-e", script]);
  return stdout
    .split("\n")
    .map((line) => line.split(FIELD_SEPARATOR))
    .filter((fields) => fields.length === 3 && fields[0])
    .map(([id, name, workingDirectory]) => ({ id, name, workingDirectory }));
}

/** Run an AppleScript `command` with `t` bound to the located terminal; false if it is gone. */
async function onTerminal(location: TerminalLocation, command: string): Promise<boolean> {
  const script = `
tell application "Ghostty"
  set matches to (every terminal whose id is "${escapeAppleScript(location.identifier)}")
  if (count of matches) is 0 then return "not_found"
  set t to item 1 of matches
  ${command}
end tell
return "ok"`;
  const { stdout } = await execFileAsync("osascript", ["-e", script]);
  return stdout.trim() === "ok";
}

/** Set the window title of whatever terminal owns `tty` (OSC 2). */
async function writeTitle(tty: string, title: string): Promise<void> {
  // eslint-disable-next-line no-control-regex
  const safe = title.replace(/[\x00-\x1f\x7f]/g, "");
  await writeFile(tty, `\x1b]2;${safe}\x07`, { flag: "a" });
}

/**
 * Ghostty's AppleScript terminals expose an id, title and working directory,
 * but not their TTY. Find the one owning `tty` without guessing:
 * 1. only TTYs whose session was started by a ghostty process qualify;
 * 2. if exactly one terminal's working directory matches a process on this
 *    TTY, and no other Ghostty TTY has a process there, that is it;
 * 3. otherwise briefly set a unique title on the TTY, find the terminal now
 *    showing it, and restore its previous title.
 */
async function findTerminalId(tty: string): Promise<string | null> {
  const processes = await listProcesses();
  const ghosttyPids = new Set(
    processes.filter((p) => isProcessName(p.comm, "ghostty")).map((p) => p.pid),
  );
  if (ghosttyPids.size === 0) return null;

  const ttyName = tty.replace(/^\/dev\//, "");
  const ghosttyTtys = new Set(
    processes.filter((p) => ghosttyPids.has(p.ppid) && p.tty !== "??").map((p) => p.tty),
  );
  if (!ghosttyTtys.has(ttyName)) return null;

  const terminals = await listTerminals();
  const sessionProcesses = processes.filter((p) => ghosttyTtys.has(p.tty));
  const cwdByPid = await getProcessCwdsAsync(sessionProcesses.map((p) => p.pid));
  const ownDirs = new Set<string>();
  const otherDirs = new Set<string>();
  for (const p of sessionProcesses) {
    const cwd = cwdByPid.get(p.pid);
    if (cwd) (p.tty === ttyName ? ownDirs : otherDirs).add(cwd);
  }

  // Trust the directory only when exactly one terminal is in a folder no other Ghostty TTY uses.
  const byDirectory = terminals.filter((t) => ownDirs.has(t.workingDirectory));
  if (byDirectory.length === 1 && !otherDirs.has(byDirectory[0].workingDirectory)) {
    return byDirectory[0].id;
  }

  const marker = `ai-devkit-${process.pid}-${Date.now()}`;
  await writeTitle(tty, marker);
  for (let attempt = 0; attempt < MARKER_POLL_ATTEMPTS; attempt++) {
    const marked = (await listTerminals()).find((t) => t.name === marker);
    if (marked) {
      const previous = terminals.find((t) => t.id === marked.id)?.name ?? "";
      await writeTitle(tty, previous);
      return marked.id;
    }
    await sleep(MARKER_POLL_INTERVAL_MS);
  }
  return null;
}

/**
 * A Ghostty `text:` action that writes `bytes` to the terminal as typed.
 * Unlike `send key`, it does not go through the keyboard layout or input
 * method, which can turn a digit key into another character.
 */
function textAction(bytes: string): string {
  const escaped = Array.from(bytes, (char) => {
    if (char === "\\") return "\\\\";
    const code = char.charCodeAt(0);
    return code >= 0x20 && code < 0x7f ? char : `\\x${code.toString(16).padStart(2, "0")}`;
  }).join("");
  return `perform action "${escapeAppleScript(`text:${escaped}`)}" on t`;
}

export const ghosttyBackend: TerminalBackend = {
  type: TerminalType.GHOSTTY,
  label: "Ghostty",

  async find(tty) {
    try {
      const id = await findTerminalId(tty);
      return id ? { type: TerminalType.GHOSTTY, identifier: id, tty } : null;
    } catch {
      // Ghostty not installed, not scriptable, or the TTY is not writable
      return null;
    }
  },

  async focus(location) {
    return onTerminal(location, "focus t\n  activate");
  },

  async send(location, message) {
    if (!(await onTerminal(location, `input text "${escapeAppleScript(message)}" to t`))) {
      throw new Error(`Ghostty terminal not found for TTY ${location.tty}`);
    }
    await sleep(150);
    if (!(await onTerminal(location, textAction(CARRIAGE_RETURN)))) {
      throw new Error(
        `Ghostty terminal disappeared before Enter could be sent for TTY ${location.tty}`,
      );
    }
  },

  async sendKey(location, key) {
    if (!(await onTerminal(location, textAction(key)))) {
      throw new Error(`Ghostty terminal not found for TTY ${location.tty}`);
    }
  },
};
