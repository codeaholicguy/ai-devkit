import chalk from "chalk";

export type StatusColor = "green" | "yellow" | "red" | "dim";

export interface StatusDisplay {
  label: string;
  color: StatusColor;
}

export const STATUS_DISPLAY = {
  ok: { label: "OK", color: "green" },
  limited: { label: "LIMITED", color: "yellow" },
  "not-authenticated": { label: "NOT AUTHENTICATED", color: "yellow" },
  exhausted: { label: "EXHAUSTED", color: "red" },
  unknown: { label: "UNKNOWN", color: "dim" },
} as const satisfies Record<string, StatusDisplay>;

export type StatusKey = keyof typeof STATUS_DISPLAY;

export function getStatusDisplay(status: string): StatusDisplay {
  return STATUS_DISPLAY[status as StatusKey] ?? STATUS_DISPLAY.unknown;
}

export function getStatusKeyByLabel(label: string): StatusKey {
  return (
    (Object.entries(STATUS_DISPLAY).find(
      ([, display]) => display.label === label.trim(),
    )?.[0] as StatusKey | undefined) ?? "unknown"
  );
}

export function colorStatus(status: string, text?: string): string {
  const display = getStatusDisplay(status);
  return chalk[display.color](text ?? display.label);
}
