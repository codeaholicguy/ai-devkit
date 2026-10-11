// Shared by the compositions and the page; must not import remotion, or it
// leaks into the homepage's initial bundle.

export const FPS = 30;
export const s = (seconds: number) => Math.round(seconds * FPS);

export const CONSOLE_SIZE = { width: 1280, height: 720 };
export const CONSOLE_OPEN_AT = s(2.4);
export const CONSOLE_DURATION = CONSOLE_OPEN_AT + s(15);

export const TERMINAL_SIZE = { width: 1000, height: 640 };

export const mono = "var(--font-mono)";

export const palette = {
  bg: "#0c0e17",
  pane: "#11131c",
  border: "#2a2d3c",
  text: "#e1e1ef",
  dim: "#8a8f9e",
  dimmer: "#7f8494",
  cyan: "#7dcfff",
  green: "#8fd694",
  amber: "#e0af68",
  red: "#ffb4ab",
  violet: "#bac3ff",
};

export function Caret({ visible, size = 20 }: { visible: boolean; size?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: Math.round(size * 0.52),
        height: size,
        marginLeft: 2,
        verticalAlign: `-${Math.round(size * 0.2)}px`,
        backgroundColor: visible ? palette.green : "transparent",
      }}
    />
  );
}
