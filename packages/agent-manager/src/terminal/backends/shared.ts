import { execFile } from "child_process";
import { promisify } from "util";
import { escapeAppleScript } from "../../utils/applescript.js";

export const CARRIAGE_RETURN = "\x0d";
export const ESCAPE_BYTE = "\x1b";
const execFileAsync = promisify(execFile);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function execFileWithInput(
  command: string,
  args: string[],
  input: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = execFile(command, args, (error) => {
      if (error) reject(error);
      else resolve();
    });
    if (!child.stdin) {
      reject(new Error(`Cannot write stdin to ${command}`));
      return;
    }
    child.stdin.end(input);
  });
}

export function appleScriptKeyAction(key: string): string {
  if (key === ESCAPE_BYTE) return "key code 53";
  return `keystroke "${escapeAppleScript(key)}"`;
}

/** Whether a `ps` comm value (bare name or full executable path) is `name`. */
export function isProcessName(comm: string, name: string): boolean {
  return comm === name || comm.endsWith(`/${name}`);
}

export async function isProcessRunning(name: string): Promise<boolean> {
  const { stdout } = await execFileAsync("ps", ["-Axo", "comm"]);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .some((command) => isProcessName(command, name));
}
