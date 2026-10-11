"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import dynamic from "next/dynamic";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { finalLines, toneStyle } from "./remotion/terminal";
import { terminalScripts, type TerminalScriptId } from "./remotion/terminalScripts";
import { FPS, TERMINAL_SIZE } from "./remotion/theme";

const terminalBox = { aspectRatio: `${TERMINAL_SIZE.width} / ${TERMINAL_SIZE.height}` };

const LoopPlayer = dynamic(() => import("./remotion/LoopPlayer"), {
  ssr: false,
  loading: () => <div style={terminalBox} aria-hidden="true" />,
});

const loadComposition = () => import("./remotion/TerminalComposition");

interface Artifact {
  command: string;
  title: string;
  caption: string;
  script: TerminalScriptId;
}

const artifacts: Artifact[] = [
  {
    command: ".ai-devkit.json",
    title: "One config for every agent",
    caption: "Add an agent by editing one file. install sets it up from there.",
    script: "config",
  },
  {
    command: "agent send",
    title: "Send work between agents",
    caption: "Pipe test output to an agent, wait for its reply, or message a group.",
    script: "send",
  },
  {
    command: "memory search",
    title: "Memory that survives sessions",
    caption: "One agent stores a decision. Any agent finds it in a later session.",
    script: "memory",
  },
  {
    command: "status",
    title: "Check what's connected",
    caption: "See what isn't wired, fix it with setup, then confirm.",
    script: "status",
  },
];

// Phones get the finished session as text; the animation is unreadable there.
function Transcript({ scriptId }: { scriptId: TerminalScriptId }) {
  const script = terminalScripts[scriptId];
  return (
    <div className="space-y-5 px-5 py-5">
      {script.panes.map((pane, i) => {
        const lines = finalLines(pane);
        return (
          <div key={i}>
            {pane.title && (
              <p className="mb-2 font-mono text-xs text-console-cyan">{pane.title}</p>
            )}
            <pre
              tabIndex={0}
              role="region"
              aria-label={pane.title ? `${pane.title} terminal output` : "Terminal output"}
              className="m-0 overflow-x-auto whitespace-pre rounded-none bg-transparent p-0 pb-2 font-mono text-xs leading-6"
            >
              {lines.map((line, j) => (
                <span key={j} className="block min-h-6 w-max">
                  {line.length === 0
                    ? " "
                    : line.map((s, k) => (
                        <span key={k} style={toneStyle[s.tone]}>
                          {s.text}
                        </span>
                      ))}
                </span>
              ))}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

export default function CommandShowcase() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const artifact = artifacts[active];
  const script = terminalScripts[artifact.script];
  const wide = useMediaQuery("(min-width: 640px)");
  const tabId = (i: number) => `${baseId}-tab-${i}`;
  const panelId = `${baseId}-panel`;

  // WAI-ARIA tabs: arrows move and select, Home/End jump to the ends.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const n = artifacts.length;
    const next: Record<string, number> = {
      ArrowRight: (active + 1) % n,
      ArrowDown: (active + 1) % n,
      ArrowLeft: (active - 1 + n) % n,
      ArrowUp: (active - 1 + n) % n,
      Home: 0,
      End: n - 1,
    };
    if (!(event.key in next)) return;
    event.preventDefault();
    setActive(next[event.key]);
    tabs.current[next[event.key]]?.focus();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-12">
      <div
        role="tablist"
        aria-label="What AI DevKit does"
        onKeyDown={onKeyDown}
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0"
      >
        {artifacts.map((item, i) => {
          const selected = i === active;
          return (
            <button
              key={item.command}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              id={tabId(i)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={`min-h-12 shrink-0 snap-start rounded-lg border px-4 py-3 text-left transition-colors lg:border-l-2 lg:border-y-0 lg:border-r-0 lg:rounded-none lg:rounded-r-lg lg:px-5 lg:py-4 ${
                selected
                  ? "border-signal bg-surface-container-low"
                  : "border-surface-container-high hover:bg-surface-container-low/60 lg:border-surface-container-high"
              }`}
            >
              <span
                className={`block font-mono text-xs ${
                  selected ? "text-signal" : "text-on-surface-dim"
                }`}
              >
                {item.command}
              </span>
              <span className="mt-1 block text-[0.9375rem] font-semibold text-on-surface">
                {item.title}
              </span>
              <span className="mt-1 hidden max-w-[40ch] text-sm leading-6 text-on-surface-dim lg:block">
                {item.caption}
              </span>
            </button>
          );
        })}
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(active)}
        tabIndex={0}
        className="min-w-0 self-start overflow-hidden rounded-xl border border-surface-container-high bg-surface-container-lowest"
      >
        <div className="border-b border-surface-container px-5 py-3 font-mono text-xs text-on-surface-dim">
          {artifact.command}
        </div>
        <div className="hidden sm:block">
          {wide ? (
            <LoopPlayer
              key={artifact.script}
              lazyComponent={loadComposition}
              inputProps={{ scriptId: artifact.script }}
              durationInFrames={Math.round(script.duration * FPS)}
              width={TERMINAL_SIZE.width}
              height={TERMINAL_SIZE.height}
              label={script.label}
            />
          ) : (
            <div style={terminalBox} />
          )}
        </div>
        <div className="sm:hidden">
          <Transcript scriptId={artifact.script} />
        </div>
        <p className="border-t border-surface-container px-5 py-4 text-sm leading-6 text-on-surface-variant lg:hidden">
          {artifact.caption}
        </p>
      </div>
    </div>
  );
}
