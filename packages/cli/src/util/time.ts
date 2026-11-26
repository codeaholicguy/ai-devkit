const MS_PATTERN = /^\d+$/;
const MILLISECONDS_ERROR = "Expected positive integer milliseconds.";
const DURATION_FULL_PATTERN = /^(\d+[smhd])+$/i;
const DURATION_PART_PATTERN = /(\d+)([smhd])/gi;
const MAX_SCHEDULE_DURATION_MS = 365 * 24 * 60 * 60 * 1000;
const ISO_TZ_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|z|[+-]\d{2}:\d{2})$/;

const DURATION_UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseDurationMs(value: string): number {
  const trimmed = value.trim();
  const invalid = () =>
    new Error(
      `Invalid --in duration "${value}". Use positive durations with units s, m, h, or d (e.g. 30s, 15m, 2h, 1d, 1h30m).`,
    );
  if (!DURATION_FULL_PATTERN.test(trimmed)) {
    throw invalid();
  }
  const seenUnits = new Set<string>();
  let totalMs = 0;
  for (const match of trimmed.matchAll(DURATION_PART_PATTERN)) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (seenUnits.has(unit) || !Number.isFinite(amount)) {
      throw invalid();
    }
    seenUnits.add(unit);
    totalMs += amount * DURATION_UNIT_MS[unit];
  }
  if (!Number.isFinite(totalMs) || totalMs <= 0 || totalMs > MAX_SCHEDULE_DURATION_MS) {
    throw invalid();
  }
  return totalMs;
}

export function parseFutureIsoTimestamp(value: string, nowMs = Date.now()): string {
  const trimmed = value.trim();
  const invalid = () =>
    new Error(
      `Invalid --at timestamp "${value}". Expected ISO-8601 with timezone (e.g. 2026-11-25T21:00:00Z).`,
    );
  const match = ISO_TZ_PATTERN.exec(trimmed);
  if (!match) {
    throw invalid();
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] !== undefined ? Number(match[6]) : 0;
  const tz = match[8];
  if (
    year < 1970 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw invalid();
  }
  if (tz !== "Z" && tz !== "z") {
    const tzHour = Number(tz.slice(1, 3));
    const tzMinute = Number(tz.slice(4, 6));
    if (tzHour > 23 || tzMinute > 59) {
      throw invalid();
    }
  }
  const parsedMs = Date.parse(trimmed);
  if (!Number.isFinite(parsedMs)) {
    throw invalid();
  }
  if (parsedMs <= nowMs) {
    throw new Error("--at timestamp must be in the future.");
  }
  return new Date(parsedMs).toISOString();
}

export interface ParsedMilliseconds {
  milliseconds: number;
  label?: string;
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parseMilliseconds(
  value: string | undefined,
  defaultMs: number,
): ParsedMilliseconds {
  if (value === undefined) {
    return { milliseconds: defaultMs };
  }

  const trimmed = value.trim();
  if (!MS_PATTERN.test(trimmed)) {
    throw new Error(MILLISECONDS_ERROR);
  }

  const milliseconds = Number(trimmed);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    throw new Error(MILLISECONDS_ERROR);
  }

  return { milliseconds, label: `${milliseconds}ms` };
}
