'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { REPO_URL } from '@/lib/utils';
import GitHubIcon from './GitHubIcon';
import GitHubStars from './GitHubStars';

const navigation = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'FAQ', href: '/faq' },
  { name: 'Vision', href: '/vision' },
  { name: 'Roadmap', href: '/roadmap' },
  { name: 'Skills', href: '/skills' },
];

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const isCurrent = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  const tone = (href: string) =>
    isCurrent(href) ? 'text-fg-strong' : 'text-fg-muted hover:text-fg-strong';

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-canvas text-fg">
      <nav className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10" aria-label="Main navigation">
        <div className="flex h-16 items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 rounded text-xl font-semibold no-underline hover:opacity-100"
          >
            <Image src="/logo.svg" alt="" width={32} height={32} className="rounded-sm" />
            AI DevKit
          </Link>

          <div className="hidden md:flex md:items-center md:space-x-8">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                aria-current={isCurrent(item.href) ? 'page' : undefined}
                className={`text-sm font-medium no-underline transition-colors hover:opacity-100 ${tone(item.href)}`}
              >
                {item.name}
              </Link>
            ))}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-fg-muted no-underline transition-colors hover:text-fg-strong hover:opacity-100"
            >
              <GitHubIcon />
              GitHub
              <span className="sr-only">(opens in a new tab)</span>
              <GitHubStars />
            </a>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="inline-flex h-11 w-11 items-center justify-center rounded hover:bg-tint md:hidden"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
          >
            <span className="sr-only">{mobileMenuOpen ? 'Close main menu' : 'Open main menu'}</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={mobileMenuOpen ? 'M6 18L18 6M6 6l12 12' : 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5'}
              />
            </svg>
          </button>
        </div>

        {mobileMenuOpen && (
          <div id="mobile-menu" className="space-y-1 border-t border-rule py-4 md:hidden">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                aria-current={isCurrent(item.href) ? 'page' : undefined}
                className={`block rounded px-3 py-2 text-base font-medium no-underline hover:bg-tint ${tone(item.href)}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.name}
              </Link>
            ))}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded px-3 py-2 text-base font-medium text-fg-muted no-underline hover:bg-tint hover:text-fg-strong"
            >
              GitHub
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        )}
      </nav>
    </header>
  );
}
