import Link from 'next/link';
import type { DocNavGroup } from '@/lib/docs/nav';

interface DocsSidebarProps {
  nav: DocNavGroup[];
  currentSlug: string;
}

export default function DocsSidebar({ nav, currentSlug }: DocsSidebarProps) {
  return (
    <nav aria-label="Docs" className="docs-sidebar">
      {nav.map((group) => (
        <div key={group.section.id} className="docs-sidebar-group">
          <p className="docs-sidebar-label">{group.section.id}/</p>
          <ul>
            {group.pages.map((page) => {
              const current = page.slug === currentSlug;
              return (
                <li key={page.slug}>
                  <Link
                    href={`/docs/${page.slug}`}
                    aria-current={current ? 'page' : undefined}
                    className="docs-sidebar-link"
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
