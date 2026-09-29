/**
 * Session Matching Constants
 *
 * Kept apart from matching.ts so session locators can import them even when
 * adapter tests fully mock matching.ts.
 */

/**
 * Maximum allowed delta between process start time and session file birth time.
 *
 * Single source of truth for matchProcessesToSessions and for locator
 * discovery windows: a window narrower than this would skip files the matcher
 * would accept.
 */
export const MATCH_TOLERANCE_MS = 3 * 60 * 1000; // 3 minutes
