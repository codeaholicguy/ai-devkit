"use client";

import { useState } from "react";

interface CopyCommandButtonProps {
  command: string;
}

export default function CopyCommandButton({ command }: CopyCommandButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex w-full max-w-full items-center overflow-hidden rounded border border-[#d5d9e8] bg-white font-mono text-sm leading-[22px] text-[#2e303a] sm:w-auto">
      <code className="min-w-0 flex-1 overflow-x-auto px-4 py-3">
        {command}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="min-h-12 border-l border-[#d5d9e8] bg-[#b3f6ab] px-4 text-sm font-semibold text-[#003909] transition-colors hover:bg-[#96d68f]"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
