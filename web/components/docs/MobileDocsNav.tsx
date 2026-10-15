'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import SearchButton from './SearchButton';

interface MobileDocsNavProps {
  sectionTitle?: string;
  pageTitle: string;
  children: ReactNode;
}

/**
 * Below 1024px the sidebar collapses into a disclosure under a sticky bar.
 * Built on <details> so it still opens without JavaScript.
 */
export default function MobileDocsNav({ sectionTitle, pageTitle, children }: MobileDocsNavProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const close = () => {
    const details = detailsRef.current;
    if (!details?.open) return;
    details.open = false;
    details.querySelector('summary')?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  return (
    <div className="docs-mobile-bar lg:hidden" onKeyDown={onKeyDown}>
      <details ref={detailsRef} className="docs-mobile-menu">
        <summary>
          <span className="docs-mobile-icon" aria-hidden="true">☰</span>
          <span className="sr-only">Docs menu, current page: </span>
          <span className="docs-mobile-crumb">
            {sectionTitle && <span className="docs-mobile-section">{sectionTitle} /</span>}
            <span className="docs-mobile-page">{pageTitle}</span>
          </span>
        </summary>
        <div
          className="docs-mobile-panel"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) close();
          }}
        >
          {children}
        </div>
      </details>
      <SearchButton variant="icon" />
    </div>
  );
}
