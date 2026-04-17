/**
 * Detect whether the current process is attached to an interactive terminal
 * on both stdin and stdout. Used by commands that need to decide between
 * prompting the user and falling back to a non-interactive default
 * (e.g., when running under CI, `npx ... | cat`, or other piped contexts).
 */
export function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
