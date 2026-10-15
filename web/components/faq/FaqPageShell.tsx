import Link from 'next/link';
import type { ReactNode } from 'react';
import { extractHeadings } from '@/lib/docs/nav';
import DocContent from '@/components/docs/DocContent';
import { TocAside, TocInline } from '@/components/docs/Toc';
import CopyToMarkdownButton from '@/components/CopyToMarkdownButton';

// The outline earns its space only on pages with a few sections.
const MIN_TOC_SECTIONS = 3;

export interface FaqCrumb {
  label: string;
  href?: string;
}

interface FaqPageShellProps {
  breadcrumb: FaqCrumb[];
  title: string;
  description?: string;
  content: string;
  /** Include the page in the ⌘K search index. */
  searchable?: boolean;
  /** Shown between the header and the body, e.g. a link to the source doc. */
  intro?: ReactNode;
  /** Shown after the body: next steps and related links. */
  children?: ReactNode;
}

/**
 * Reading layout for FAQ pages: content plus an "On this page" outline,
 * no docs sidebar. Visitors land on one answer from search.
 */
export default function FaqPageShell({
  breadcrumb,
  title,
  description,
  content,
  searchable = false,
  intro,
  children,
}: FaqPageShellProps) {
  const headings = extractHeadings(content);
  const showToc =
    headings.filter((heading) => heading.depth === 2).length >= MIN_TOC_SECTIONS;

  return (
    <div className="faq-shell">
      <article
        id="faq-content"
        className="faq-shell-content"
        {...(searchable ? { 'data-pagefind-body': '' } : {})}
      >
        <nav aria-label="Breadcrumb" className="docs-breadcrumb" data-pagefind-ignore>
          <ol>
            {breadcrumb.map((crumb) => (
              <li key={crumb.label}>
                {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : crumb.label}
              </li>
            ))}
            <li aria-current="page">{title}</li>
          </ol>
        </nav>

        <header className="docs-page-header">
          <h1>{title}</h1>
          {description && <p className="docs-page-description">{description}</p>}
          <div className="docs-page-actions" data-pagefind-ignore>
            <CopyToMarkdownButton content={content} title={title} />
          </div>
        </header>

        {intro}
        {showToc && <TocInline headings={headings} />}
        <DocContent content={content} />
        {children}
      </article>

      {showToc && (
        <aside className="docs-shell-toc">
          <TocAside headings={headings} />
        </aside>
      )}
    </div>
  );
}
