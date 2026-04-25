export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function truncate(
  text: string,
  maxLength: number,
  replaceText: string = "...",
): string {
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
