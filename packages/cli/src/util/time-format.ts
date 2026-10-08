const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
const DAY_MINUTES = 24 * HOUR_MINUTES;

export interface RelativeOrAbsoluteTimeOptions {
  now?: () => Date;
  fallback?: string;
}

export function formatClockTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Compact relative time for dense UI rows: "now", "5s ago", "3m ago", "2h ago", "4d ago". */
export function formatRelativeCompact(date: Date | string | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 5) return "now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/** Minute-granularity relative time with future support: "just now", "5m ago", "in 5m". */
export function formatRelativeTime(
  timestamp: Date,
  now = new Date(Date.now()),
): string {
  const diffMs = new Date(timestamp).getTime() - now.getTime();
  const future = diffMs > 0;
  const absMs = Math.abs(diffMs);
  const diffMinutes = future
    ? Math.ceil(absMs / 60000)
    : Math.floor(absMs / 60000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60)
    return future ? `in ${diffMinutes}m` : `${diffMinutes}m ago`;

  const diffHours = future
    ? Math.ceil(diffMinutes / 60)
    : Math.floor(diffMinutes / 60);
  if (diffHours < 24) return future ? `in ${diffHours}h` : `${diffHours}h ago`;

  const diffDays = future
    ? Math.ceil(diffHours / 24)
    : Math.floor(diffHours / 24);
  return future ? `in ${diffDays}d` : `${diffDays}d ago`;
}

export function formatLocalTimestamp(timestamp: Date): string {
  return new Date(timestamp).toLocaleString();
}

export function formatLocalTimestampWithRelative(
  timestamp: Date,
  now = new Date(Date.now()),
): string {
  return `${formatLocalTimestamp(timestamp)} (${formatRelativeTime(timestamp, now)})`;
}

export function formatRelativeOrAbsoluteTime(
  value: string | Date | null | undefined,
  options: RelativeOrAbsoluteTimeOptions = {},
): string {
  const fallback = options.fallback ?? "—";
  if (!value) return fallback;

  const target = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(target.getTime())) return fallback;

  const now = options.now?.() ?? new Date();
  const deltaMinutes = Math.round(
    (target.getTime() - now.getTime()) / MINUTE_MS,
  );
  const absoluteMinutes = Math.abs(deltaMinutes);
  const clock = formatClockTime(target);

  if (absoluteMinutes === 0) return "now";

  if (absoluteMinutes < HOUR_MINUTES) {
    return relativeLabel(deltaMinutes, `${absoluteMinutes}m`, clock);
  }

  if (absoluteMinutes < DAY_MINUTES) {
    const hours = Math.floor(absoluteMinutes / HOUR_MINUTES);
    const minutes = absoluteMinutes % HOUR_MINUTES;
    const duration = `${hours}h${minutes ? ` ${minutes}m` : ""}`;
    return relativeLabel(deltaMinutes, duration, clock);
  }

  return `${MONTHS[target.getMonth()]} ${target.getDate()} · ${clock}`;
}

function relativeLabel(
  deltaMinutes: number,
  duration: string,
  clock: string,
): string {
  return deltaMinutes > 0
    ? `in ${duration} · ${clock}`
    : `${duration} ago · ${clock}`;
}
