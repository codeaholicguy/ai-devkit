"use client";

import { useEffect, useRef, useState } from "react";

interface CommandBarProps {
  command: string;
  className?: string;
}

const copyStates = {
  idle: { label: "Copy", status: "" },
  copied: { label: "Copied", status: "Command copied to clipboard" },
  failed: {
    label: "Select it",
    status: "Copy failed. Select the command text and copy it manually.",
  },
};

type CopyState = keyof typeof copyStates;

export default function CommandBar({ command, className = "" }: CommandBarProps) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleCopy = async () => {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(command);
      setState("copied");
    } catch {
      setState("failed");
    }
    timer.current = window.setTimeout(() => setState("idle"), 2000);
  };

  return (
    <div
      className={`inline-flex min-w-0 max-w-full items-stretch overflow-hidden rounded-lg border border-outline bg-surface-container-low font-mono text-sm text-on-surface ${className}`}
    >
      <code className="flex min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap bg-transparent py-3 pl-4 pr-3 text-[0.9375rem]">
        <span className="select-none text-signal" aria-hidden="true">
          $&nbsp;
        </span>
        {command}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="min-h-12 min-w-[5.5rem] shrink-0 bg-primary px-4 font-sans text-sm font-semibold text-on-primary transition-[background-color,transform] hover:bg-primary-strong active:scale-[0.98]"
      >
        {copyStates[state].label}
        <span className="sr-only"> command: {command}</span>
      </button>
      <span className="sr-only" role="status">
        {copyStates[state].status}
      </span>
    </div>
  );
}
