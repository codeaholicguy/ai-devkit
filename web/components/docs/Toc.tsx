'use client';

import { useEffect, useState } from 'react';
import type { DocHeading } from '@/lib/docs/nav';

const ACTIVE_OFFSET = 128;

const COMMAND_PREFIX = /^ai-devkit\s+/;

function linkClass(heading: DocHeading) {
  return [
    'toc-link',
    heading.depth === 3 && 'toc-link-sub',
    COMMAND_PREFIX.test(heading.text) && 'toc-link-cmd',
  ]
    .filter(Boolean)
    .join(' ');
}

function TocList({ headings, activeId }: { headings: DocHeading[]; activeId?: string }) {
  return (
    <ul className="toc-list">
      {headings.map((heading) => (
        <li key={heading.id}>
          <a
            href={`#${heading.id}`}
            className={linkClass(heading)}
            aria-current={heading.id === activeId ? 'location' : undefined}
          >
            {heading.text.replace(COMMAND_PREFIX, '')}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The h2 that owns each heading, so sub-headings show only for the active section. */
function parentSectionIds(headings: DocHeading[]) {
  const parents = new Map<string, string>();
  let current = '';
  for (const heading of headings) {
    if (heading.depth === 2) current = heading.id;
    parents.set(heading.id, current);
  }
  return parents;
}

/** Right-column outline (≥1280px) with scroll-spy. */
export function TocAside({ headings }: { headings: DocHeading[] }) {
  const [activeId, setActiveId] = useState<string>();

  useEffect(() => {
    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      let current = elements[0].id;
      for (const element of elements) {
        if (element.getBoundingClientRect().top - ACTIVE_OFFSET <= 0) current = element.id;
        else break;
      }
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setActiveId(atBottom ? elements[elements.length - 1].id : current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('hashchange', update);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('hashchange', update);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [headings]);

  const parents = parentSectionIds(headings);
  const activeSection = activeId ? parents.get(activeId) : undefined;
  const visible = headings.filter(
    (heading) => heading.depth === 2 || parents.get(heading.id) === activeSection,
  );

  return (
    <nav aria-label="On this page" className="toc-aside">
      <p className="toc-title">On this page</p>
      <TocList headings={visible} activeId={activeId} />
    </nav>
  );
}

/** Collapsed outline under the title on narrower screens. */
export function TocInline({ headings }: { headings: DocHeading[] }) {
  return (
    <details className="toc-inline xl:hidden">
      <summary>On this page</summary>
      <nav aria-label="On this page">
        <TocList headings={headings} />
      </nav>
    </details>
  );
}
