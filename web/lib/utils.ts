export const REPO_URL = "https://github.com/codeaholicguy/ai-devkit";

/**
 * Format star count for display
 * @param count - The number of stars
 * @returns Formatted string (e.g., "1.5k" for 1500)
 */
export function formatStars(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

