import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { paneAt, toneStyle, type Line } from "./terminal";
import { terminalScripts, type TerminalScriptId } from "./terminalScripts";
import { Caret, TERMINAL_SIZE, mono, palette } from "./theme";

const PADDING = 26;
const LINE = 27;
const PANE_GAP = 14;
const PANE_HEADER = 34;
const PANE_PADDING_X = 18;
const PANE_PADDING_BOTTOM = 16;
const PANE_BORDER = 1;

const TerminalLine: React.FC<{ line: Line; caret?: boolean }> = ({ line, caret }) => (
  <div style={{ height: LINE, lineHeight: `${LINE}px`, whiteSpace: "pre", overflow: "hidden" }}>
    {line.length === 0 && caret === undefined ? " " : null}
    {line.map((s, i) => (
      <span key={i} style={toneStyle[s.tone]}>
        {s.text}
      </span>
    ))}
    {caret !== undefined && <Caret visible={caret} />}
  </div>
);

export default function TerminalComposition({ scriptId }: { scriptId: TerminalScriptId }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { panes } = terminalScripts[scriptId];
  const multi = panes.length > 1;

  const states = panes.map((pane) => paneAt(pane, t));
  const active = states.reduce((best, st, i) => (st.lastStart > states[best].lastStart ? i : best), 0);
  const blinkOn = Math.floor(t * 2) % 2 === 0;

  const totalWeight = panes.reduce((sum, p) => sum + (p.weight ?? 1), 0);
  const usable = TERMINAL_SIZE.height - PADDING * 2 - PANE_GAP * (panes.length - 1);
  const chrome = multi ? PANE_HEADER + PANE_PADDING_BOTTOM + PANE_BORDER * 2 : 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: palette.bg,
        fontFamily: mono,
        fontSize: 18,
        padding: PADDING,
        gap: PANE_GAP,
      }}
    >
      {panes.map((pane, i) => {
        const height = (usable * (pane.weight ?? 1)) / totalWeight;
        const maxLines = Math.floor((height - chrome) / LINE);
        const { lines, caret, typing } = states[i];
        const offset = Math.max(0, lines.length - maxLines);
        const isActive = i === active;

        return (
          <div
            key={i}
            style={{
              height,
              overflow: "hidden",
              ...(multi && {
                border: `${PANE_BORDER}px solid ${isActive ? palette.cyan : palette.border}`,
                borderRadius: 12,
                padding: `0 ${PANE_PADDING_X}px ${PANE_PADDING_BOTTOM}px`,
              }),
            }}
          >
            {multi && (
              <div
                style={{
                  height: PANE_HEADER,
                  lineHeight: `${PANE_HEADER}px`,
                  fontSize: 15,
                  color: isActive ? palette.cyan : palette.dim,
                  whiteSpace: "nowrap",
                }}
              >
                {pane.title}
              </div>
            )}
            {lines.slice(offset).map((line, j) => (
              <TerminalLine
                key={j + offset}
                line={line}
                caret={isActive && j + offset === caret ? typing || blinkOn : undefined}
              />
            ))}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
