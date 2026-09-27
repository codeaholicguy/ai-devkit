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
