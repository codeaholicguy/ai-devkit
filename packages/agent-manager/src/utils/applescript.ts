/**
 * Escape a string for safe use inside an AppleScript double-quoted string.
 * Backslashes, double quotes, and newlines must be escaped.
 */
export function escapeAppleScript(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r\n|\r|\n/g, '\\n');
}
