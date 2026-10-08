// eslint-disable-next-line no-control-regex
export const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*m/g;

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Strip OSC controls as a unit, then remove remaining terminal control bytes except newline/tab. */
export function sanitizeProviderOutput(value: string): string {
  // eslint-disable-next-line no-control-regex
  const withoutOsc = value.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
  return Array.from(withoutOsc, (character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10) || code === 127
      ? ""
      : character;
  }).join("");
}

export function truncate(text: string, maxLength: number, replaceText: string = "..."): string {
  if (maxLength <= 0) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  if (replaceText.length >= maxLength) {
    return replaceText.substring(0, maxLength);
  }

  return `${text.substring(0, maxLength - replaceText.length)}${replaceText}`;
}
