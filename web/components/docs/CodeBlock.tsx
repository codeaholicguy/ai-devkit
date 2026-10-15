'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

const SHELL_LANGUAGES = new Set(['bash', 'sh', 'shell', 'zsh', 'console']);

type CopyState = 'idle' | 'copied' | 'manual';

interface CodeBlockProps {
  language?: string;
  children: ReactNode;
}

export default function CodeBlock({ language, children }: CodeBlockProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<CopyState>('idle');
  const isShell = language ? SHELL_LANGUAGES.has(language) : false;
  const label = language ?? 'text';

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), state === 'copied' ? 2000 : 4000);
    return () => clearTimeout(timer);
  }, [state]);

  const handleCopy = async () => {
    const code = bodyRef.current?.querySelector('code') ?? bodyRef.current;
    if (!code) return;
    const text = (code.textContent ?? '').replace(/\n$/, '');
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      // Clipboard blocked: select the code so the reader can copy it by hand.
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(code);
      selection?.removeAllRanges();
      selection?.addRange(range);
      setState('manual');
    }
  };

  return (
    <figure className="code-block">
      <figcaption className="code-block-bar" data-pagefind-ignore>
        <span className="code-block-lang">
          {isShell && <span className="code-block-prompt" aria-hidden="true">❯</span>}
          {label}
        </span>
        <button type="button" className="code-block-copy" onClick={handleCopy}>
          {state === 'copied' ? 'Copied' : state === 'manual' ? 'Press ⌘C to copy' : 'Copy'}
          <span className="sr-only">{state === 'idle' ? ` ${label} code` : ''}</span>
        </button>
        <span className="sr-only" aria-live="polite">
          {state === 'copied' ? 'Code copied to clipboard' : ''}
        </span>
      </figcaption>
      <div ref={bodyRef}>{children}</div>
    </figure>
  );
}
