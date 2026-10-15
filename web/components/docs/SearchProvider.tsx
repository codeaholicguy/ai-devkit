'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { REPO_URL } from '@/lib/utils';

interface PagefindSubResult {
  title: string;
  url: string;
  excerpt: string;
  locations?: number[];
}

interface PagefindData {
  url: string;
  excerpt: string;
  meta: { title?: string };
  sub_results?: PagefindSubResult[];
}

interface Pagefind {
  init: () => Promise<void>;
  debouncedSearch: (
    query: string,
    options?: object,
    delay?: number,
  ) => Promise<{ results: { data: () => Promise<PagefindData> }[] } | null>;
}

interface ResultItem {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  page: string;
  isPage: boolean;
}

type Status = 'idle' | 'loading' | 'ready' | 'unavailable';

interface QuickLink {
  title: string;
  href: string;
}

const SearchContext = createContext<{ open: () => void }>({ open: () => {} });

export function useDocsSearch() {
  return useContext(SearchContext);
}

const MAX_PAGES = 8;
const MAX_SUB_RESULTS = 3;

// Loaded at runtime from the Pagefind index written to out/pagefind at build time.
// Kept out of the bundler on purpose: the file only exists after `pagefind` runs.
const loadPagefind = new Function('url', 'return import(url)') as (url: string) => Promise<Pagefind>;

interface SearchProviderProps {
  quickLinks: QuickLink[];
  sections: { id: string; title: string }[];
  children: ReactNode;
}

export default function SearchProvider({ quickLinks, sections, children }: SearchProviderProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pagefindRef = useRef<Pagefind | null>(null);
  const listId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const loadingRef = useRef(false);

  // Load the index the first time search opens.
  const open = useCallback(() => {
    setIsOpen(true);
    if (loadingRef.current) return;
    loadingRef.current = true;
    setStatus('loading');
    loadPagefind('/pagefind/pagefind.js')
      .then(async (pagefind) => {
        await pagefind.init();
        pagefindRef.current = pagefind;
        setStatus('ready');
      })
      .catch(() => setStatus('unavailable'));
  }, []);
  const close = useCallback(() => dialogRef.current?.close(), []);

  // Show the dialog as modal so focus is trapped and the page is inert.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      inputRef.current?.select();
    }
  }, [isOpen]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing =
        target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        open();
      } else if (event.key === '/' && !typing) {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    const pagefind = pagefindRef.current;
    const term = query.trim();
    if (status !== 'ready' || !pagefind || !term) return;

    let cancelled = false;
    pagefind.debouncedSearch(term, {}, 150).then(async (search) => {
      if (!search || cancelled) return;
      const pages = await Promise.all(search.results.slice(0, MAX_PAGES).map((r) => r.data()));
      if (cancelled) return;
      const items: ResultItem[] = [];
      for (const page of pages) {
        const pageTitle = page.meta.title ?? page.url;
        const pageUrl = page.url;
        items.push({
          id: `${pageUrl}-page`,
          url: pageUrl,
          title: pageTitle,
          excerpt: page.excerpt,
          page: pageTitle,
          isPage: true,
        });
        // Pagefind lists sections in page order; surface the ones with the most matches.
        (page.sub_results ?? [])
          .filter((sub) => sub.url.includes('#'))
          .sort((a, b) => (b.locations?.length ?? 0) - (a.locations?.length ?? 0))
          .slice(0, MAX_SUB_RESULTS)
          .forEach((sub) => {
            const subUrl = sub.url;
            items.push({
              id: subUrl,
              url: subUrl,
              title: sub.title,
              excerpt: sub.excerpt,
              page: pageTitle,
              isPage: false,
            });
          });
      }
      setResults(items);
      setActiveIndex(0);
      setSearching(false);
    });
    return () => {
      cancelled = true;
    };
  }, [query, status]);

  const go = (url: string) => {
    close();
    router.push(url);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(results[activeIndex].url);
    }
  };

  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listId]);

  const term = query.trim();
  const showResults = status === 'ready' && term && results.length > 0;
  const noResults = status === 'ready' && term && !searching && results.length === 0;

  let statusText = '';
  if (status === 'loading') statusText = 'Loading search…';
  else if (showResults) statusText = `${results.length} results`;
  else if (noResults) statusText = `No results for “${term}”`;

  return (
    <SearchContext.Provider value={{ open }}>
      {children}
      <dialog
        ref={dialogRef}
        className="search-dialog"
        aria-label="Search docs"
        onClose={() => setIsOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
      >
        <div className="search-panel">
          <div className="search-input-row">
            <span className="search-prompt" aria-hidden="true">❯</span>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearching(event.target.value.trim() !== '');
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Search docs, e.g. skill add, memory, channel"
              aria-label="Search docs"
              role="combobox"
              aria-expanded={Boolean(showResults)}
              aria-controls={listId}
              aria-activedescendant={showResults ? `${listId}-${activeIndex}` : undefined}
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="search-esc">esc</kbd>
          </div>

          <div className="search-body">
            <p className="sr-only" role="status">
              {statusText}
            </p>

            {status === 'unavailable' && (
              <div className="search-message">
                <p>{`Search isn't available here.`}</p>
                <p>
                  The search index is built with the site. <Link href="/docs" onClick={close}>Browse the docs home</Link> instead.
                </p>
              </div>
            )}

            {status === 'loading' && <p className="search-message">Loading search…</p>}

            {status === 'ready' && !term && (
              <div className="search-quick">
                <p className="search-group-label">Popular</p>
                <ul>
                  {quickLinks.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} onClick={close} className="search-result">
                        <span className="search-result-title">{link.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {showResults && (
              <ul id={listId} role="listbox" aria-label="Search results" className="search-results">
                {results.map((item, index) => (
                  <li
                    key={item.id}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={item.isPage ? 'search-result' : 'search-result search-result-sub'}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => go(item.url)}
                  >
                    <span className="search-result-title">
                      {item.isPage ? item.title : `${item.page} › ${item.title}`}
                    </span>
                    {/* Pagefind escapes our own docs text and only adds <mark> around matches. */}
                    <span
                      className="search-result-excerpt"
                      dangerouslySetInnerHTML={{ __html: item.excerpt }}
                    />
                  </li>
                ))}
              </ul>
            )}

            {noResults && (
              <div className="search-message">
                <p>No results for “{term}”.</p>
                <p>Try a command name like <code>agent send</code>, or browse a section:</p>
                <ul className="search-sections">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <Link href={`/docs#${section.id}`} onClick={close}>
                        {section.title}
                      </Link>
                    </li>
                  ))}
                </ul>
                <p>
                  Still stuck?{' '}
                  <a
                    href={`${REPO_URL}/issues?q=${encodeURIComponent(term)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Search GitHub issues
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </p>
              </div>
            )}
          </div>

          <p className="search-footer" aria-hidden="true">
            <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
            <span><kbd>↵</kbd> open</span>
            <span><kbd>esc</kbd> close</span>
          </p>
        </div>
      </dialog>
    </SearchContext.Provider>
  );
}
