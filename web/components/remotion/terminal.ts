// Scripted terminal sessions, rendered by TerminalComposition (desktop) and as
// a static transcript (phones). Must not import remotion.
import type { CSSProperties } from "react";
import { palette } from "./theme";

export type Tone =
  | "on"
  | "dim"
  | "head"
  | "ok"
  | "warn"
  | "info"
  | "add"
  | "del"
  | "prompt";

export interface Seg {
  text: string;
  tone: Tone;
}

export type Line = Seg[];

export type Step =
  | { at: number; cmd: string; cps?: number }
  | { at: number; out: Line[]; stagger?: number };

export interface Pane {
  title?: string;
  weight?: number;
  steps: Step[];
}

export interface TerminalScript {
  /** Loop length in seconds. */
  duration: number;
  /** Accessible name of the demo. */
  label: string;
  panes: Pane[];
}

export const toneStyle: Record<Tone, CSSProperties> = {
  on: { color: palette.text },
  dim: { color: palette.dim },
  head: { color: palette.text, fontWeight: 700 },
  ok: { color: palette.green },
  warn: { color: palette.amber },
  info: { color: palette.cyan },
  add: { color: palette.green, backgroundColor: "rgba(143, 214, 148, 0.1)" },
  del: { color: palette.red, backgroundColor: "rgba(255, 180, 171, 0.1)" },
  prompt: { color: palette.green },
};

export const seg = (text: string, tone: Tone = "on"): Seg => ({ text, tone });

export const ln = (...parts: (string | Seg)[]): Line =>
  parts.map((p) => (typeof p === "string" ? seg(p) : p));

export const blank: Line = [];

/** Tables as the CLI prints them: 2-space indent, padded columns, ─ rule. */
export function table(headers: string[], rows: (string | Seg)[][]): Line[] {
  const indent = "  ";
  const text = (cell: string | Seg) => (typeof cell === "string" ? cell : cell.text);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => text(r[i]).length)),
  );
  const pad = (s: string, i: number) => (i === widths.length - 1 ? s : s.padEnd(widths[i] + 2));
  const ruleWidth = widths.reduce((sum, w) => sum + w + 2, 0) - 2;
  return [
    [seg(indent), ...headers.map((h, i) => seg(pad(h, i), "head"))],
    [seg(indent + "─".repeat(ruleWidth), "dim")],
    ...rows.map((r) => [
      seg(indent),
      ...r.map((cell, i) =>
        typeof cell === "string" ? seg(pad(cell, i)) : seg(pad(cell.text, i), cell.tone),
      ),
    ]),
  ];
}

const DEFAULT_CPS = 34;
const DEFAULT_STAGGER = 0.035;

export interface PaneState {
  lines: Line[];
  /** Index of the line that carries the caret, or -1. */
  caret: number;
  typing: boolean;
  /** Start of the latest started step; the most recent pane holds focus. */
  lastStart: number;
}

/** What a pane shows at `t` seconds. `t = Infinity` gives the finished state. */
export function paneAt(pane: Pane, t: number): PaneState {
  const lines: Line[] = [];
  let typing = false;
  let lastStart = -1;
  let next: Step | undefined;

  for (const step of pane.steps) {
    if (t < step.at) {
      next = step;
      break;
    }
    lastStart = step.at;
    if ("cmd" in step) {
      const chars = Math.min(step.cmd.length, Math.floor((t - step.at) * (step.cps ?? DEFAULT_CPS)));
      step.cmd
        .slice(0, chars)
        .split("\n")
        .forEach((part, i) => lines.push([seg(i === 0 ? "$ " : "> ", "prompt"), seg(part)]));
      if (chars < step.cmd.length) {
        typing = true;
        break;
      }
    } else {
      const shown = Math.min(
        step.out.length,
        Math.floor((t - step.at) / (step.stagger ?? DEFAULT_STAGGER)) + 1,
      );
      lines.push(...step.out.slice(0, shown));
    }
  }

  if (typing) return { lines, caret: lines.length - 1, typing, lastStart };
  // A typed command whose output hasn't printed yet is still running.
  if (next && "out" in next && lastStart >= 0) return { lines, caret: -1, typing, lastStart };
  lines.push([seg("$ ", "prompt")]);
  return { lines, caret: lines.length - 1, typing, lastStart };
}

/** The finished session without the trailing empty prompt. */
export const finalLines = (pane: Pane) => paneAt(pane, Infinity).lines.slice(0, -1);
