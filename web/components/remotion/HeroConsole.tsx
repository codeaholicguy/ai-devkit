"use client";

import dynamic from "next/dynamic";
import { CONSOLE_DURATION, CONSOLE_SIZE } from "./theme";

const LoopPlayer = dynamic(() => import("./LoopPlayer"), {
  ssr: false,
  loading: () => <div className="aspect-video" aria-hidden="true" />,
});

const loadComposition = () => import("./AgentConsoleComposition");

export default function HeroConsole({ label }: { label: string }) {
  return (
    <div data-theme="dark" className="overflow-hidden rounded-xl border border-surface-container-high bg-surface-container-lowest shadow-[0_32px_80px_-16px_rgba(4,6,14,0.45)]">
      <div
        className="relative flex h-10 items-center border-b border-surface-container bg-surface px-4"
        aria-hidden="true"
      >
        <div className="flex gap-2">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <span className="absolute inset-x-0 text-center font-mono text-xs text-on-surface-dim">
          ~/Code/web
        </span>
      </div>
      <LoopPlayer
        lazyComponent={loadComposition}
        durationInFrames={CONSOLE_DURATION}
        width={CONSOLE_SIZE.width}
        height={CONSOLE_SIZE.height}
        label={label}
      />
    </div>
  );
}
