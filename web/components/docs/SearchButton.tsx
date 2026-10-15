'use client';

import { useSyncExternalStore } from 'react';
import { useDocsSearch } from './SearchProvider';

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

const subscribeNoop = () => () => {};

export default function SearchButton({ variant = 'field' }: { variant?: 'field' | 'icon' }) {
  const { open } = useDocsSearch();
  const shortcut = useSyncExternalStore(
    subscribeNoop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'),
    () => '⌘K',
  );

  if (variant === 'icon') {
    return (
      <button type="button" onClick={open} className="search-trigger-icon" aria-label="Search docs">
        <SearchIcon />
      </button>
    );
  }

  return (
    <button type="button" onClick={open} className="search-trigger">
      <SearchIcon />
      <span className="search-trigger-label">Search docs</span>
      <kbd aria-hidden="true">{shortcut}</kbd>
    </button>
  );
}
