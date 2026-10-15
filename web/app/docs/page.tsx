import Link from 'next/link';
import { getAllDocPages } from '@/lib/content/loader';
import { getDocsNav } from '@/lib/docs/nav';
import { REPO_URL } from '@/lib/utils';
import CodeBlock from '@/components/docs/CodeBlock';
import SearchButton from '@/components/docs/SearchButton';
import GettingStartedGuides from '@/components/GettingStartedGuides';

import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ai-devkit.com';

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'Set up AI DevKit as a control plane for coding agents: one config, one console, local-first memory, communication, workflow skills, and verification.',
  keywords: [
    'AI DevKit documentation',
    'AI coding assistant setup',
    'AI agent control plane',
    'agent skills',
    'skills',
    'AI development tools',
    'Claude Code',
    'Cursor IDE',
    'Codex',
    'Antigravity',
    'Open Code',
    'AI pair programming',
  ],
  openGraph: {
    title: 'AI DevKit Documentation',
    description:
      'Set up one control plane for AI coding agents.',
    url: `${siteUrl}/docs`,
    siteName: 'AI DevKit',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI DevKit Documentation',
    description:
      'Set up one control plane for AI coding agents.',
  },
  alternates: {
    canonical: `${siteUrl}/docs`,
  },
};

export default function DocsPage() {
  const nav = getDocsNav(getAllDocPages());

  return (
    <div className="docs-home">
      <header className="docs-home-hero">
        <p className="docs-home-eyebrow">Documentation</p>
        <h1>Set up once. Find any command fast.</h1>
        <p className="docs-home-lede">
          Connect your coding agents to AI DevKit, then give every project the same skills, memory, and workflow.
        </p>
        <div className="docs-home-search">
          <SearchButton />
        </div>
      </header>

      <section className="docs-home-start" aria-labelledby="start-here">
        <div>
          <h2 id="start-here">Start here</h2>
          <p>
            Run setup once per machine to connect your agents, then init in each project. No global install needed.
          </p>
          <Link href="/docs/1-getting-started" className="docs-button">
            Get started →
          </Link>
        </div>
        <CodeBlock language="bash">
          <pre>
            <code>{`npx ai-devkit@latest setup\ncd your-project\nnpx ai-devkit@latest init`}</code>
          </pre>
        </CodeBlock>
      </section>

      <div className="docs-home-sections">
        {nav.map((group) => (
          <section
            key={group.section.id}
            id={group.section.id}
            className="docs-home-card"
            aria-labelledby={`${group.section.id}-title`}
          >
            <p className="docs-sidebar-label" aria-hidden="true">{group.section.id}/</p>
            <h2 id={`${group.section.id}-title`}>{group.section.title}</h2>
            <p className="docs-home-card-desc">{group.section.description}</p>
            <ul>
              {group.pages.map((page) => (
                <li key={page.slug}>
                  <Link href={`/docs/${page.slug}`}>{page.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <GettingStartedGuides />

      <section className="docs-home-help" aria-labelledby="help-title">
        <h2 id="help-title">Need help?</h2>
        <p>
          Ask on{' '}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            GitHub<span className="sr-only"> (opens in a new tab)</span>
          </a>{' '}
          or{' '}
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer">
            report an issue<span className="sr-only"> (opens in a new tab)</span>
          </a>
          .
        </p>
      </section>
    </div>
  );
}
