import Link from 'next/link';
import { REPO_URL } from '@/lib/utils';

const resources = [
  { name: 'Documentation', href: '/docs' },
  { name: 'Skills', href: '/skills' },
  { name: 'FAQ', href: '/faq' },
  { name: 'Vision', href: '/vision' },
  { name: 'Roadmap', href: '/roadmap' },
];

const community = [
  { name: 'Issues', href: `${REPO_URL}/issues` },
  { name: 'Changelog', href: `${REPO_URL}/blob/main/CHANGELOG.md` },
];

const link = 'text-fg-muted no-underline hover:text-fg-strong';
const heading = 'mb-3 text-sm font-bold text-fg-strong';

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={link}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-rule">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div>
            <h2 className={heading}>AI DevKit</h2>
            <p className="text-sm leading-relaxed text-fg-muted">
              The control plane for AI coding agents: one config, one console, local-first memory, cross-agent communication, and verification.
            </p>
          </div>

          <div>
            <h2 className={heading}>Resources</h2>
            <ul className="space-y-2 text-sm">
              {resources.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={link}>
                    {item.name}
                  </Link>
                </li>
              ))}
              <li>
                <ExternalLink href={REPO_URL}>GitHub</ExternalLink>
              </li>
            </ul>
          </div>

          <div>
            <h2 className={heading}>Community</h2>
            <ul className="space-y-2 text-sm">
              {community.map((item) => (
                <li key={item.href}>
                  <ExternalLink href={item.href}>{item.name}</ExternalLink>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-8 border-t border-rule pt-8 text-center text-sm text-fg-muted">
          © {new Date().getFullYear()} AI DevKit. Released under the Apache License 2.0.
        </p>
      </div>
    </footer>
  );
}
