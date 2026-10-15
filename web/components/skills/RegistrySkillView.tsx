'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import CodeBlock from '@/components/docs/CodeBlock';
import SafeMarkdown from './SafeMarkdown';
import {
  getCachedRegistry,
  loadRegistry,
  markOpenedFromList,
  parseRegistrySkillParam,
  skillGithubUrl,
  skillMarkdownUrl,
  wasOpenedFromList,
  type RegistrySkill,
} from '@/lib/skills/registry-client';

type IndexStatus = 'loading' | 'ready' | 'error';
type FileState = { url: string; status: 'loading' } | { url: string; status: 'ready'; text: string } | { url: string; status: 'error' };

function Shell({ crumb, children }: { crumb?: string; children: ReactNode }) {
  return (
    <div className="faq-shell">
      <article className="faq-shell-content registry-skill">
        <nav aria-label="Breadcrumb" className="docs-breadcrumb">
          <ol>
            <li>
              <Link href="/skills">Skills</Link>
            </li>
            <li>
              <Link href="/skills#registry">Registry</Link>
            </li>
            {crumb && <li aria-current="page">{crumb}</li>}
          </ol>
        </nav>
        {children}
      </article>
    </div>
  );
}

export function RegistrySkillFallback() {
  return (
    <Shell>
      <p className="registry-status" role="status">Loading skill…</p>
    </Shell>
  );
}

function BackToResults() {
  const router = useRouter();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Coming from the list: go back so search, filter, and scroll are as they were.
    if (wasOpenedFromList()) {
      event.preventDefault();
      markOpenedFromList(false);
      router.back();
    }
  };
  return (
    <Link href="/skills#registry" className="registry-back" onClick={onClick}>
      ← Back to results
    </Link>
  );
}

export default function RegistrySkillView() {
  const target = parseRegistrySkillParam(useSearchParams().get('skill'));
  const [skills, setSkills] = useState<RegistrySkill[] | null>(() => getCachedRegistry());
  const [indexStatus, setIndexStatus] = useState<IndexStatus>(() => (getCachedRegistry() ? 'ready' : 'loading'));
  const [file, setFile] = useState<FileState | null>(null);

  useEffect(() => {
    loadRegistry()
      .then((data) => {
        setSkills(data);
        setIndexStatus('ready');
      })
      .catch(() => setIndexStatus('error'));
  }, []);

  const skill =
    target && skills
      ? skills.find((candidate) => candidate.registry === target.registry && candidate.name === target.name)
      : undefined;
  const fileUrl = skill ? skillMarkdownUrl(skill) : null;

  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    fetch(fileUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`SKILL.md returned ${response.status}`);
        return response.text();
      })
      .then((text) => {
        if (!cancelled) setFile({ url: fileUrl, status: 'ready', text });
      })
      .catch(() => {
        if (!cancelled) setFile({ url: fileUrl, status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  useEffect(() => {
    if (skill) document.title = `${skill.name} skill from ${skill.registry} | AI DevKit`;
  }, [skill]);

  if (!target) {
    return (
      <Shell>
        <h1 className="registry-skill-title">No skill selected</h1>
        <p className="docs-page-description">Pick a skill from the registry to see its install command and SKILL.md.</p>
        <p className="registry-skill-actions">
          <Link href="/skills#registry" className="docs-button">Browse the registry</Link>
        </p>
      </Shell>
    );
  }

  if (indexStatus === 'error') {
    return (
      <Shell crumb={target.name}>
        <h1 className="registry-skill-title">{target.name}</h1>
        <p className="docs-page-description">{`Couldn't load the registry. Check your connection and try again.`}</p>
        <p className="registry-skill-actions">
          <button type="button" className="docs-button" onClick={() => window.location.reload()}>
            Try again
          </button>
        </p>
      </Shell>
    );
  }

  if (!skill) {
    return (
      <Shell crumb={target.name}>
        <h1 className="registry-skill-title">{target.name}</h1>
        {indexStatus === 'loading' ? (
          <p className="registry-status" role="status">Loading skill…</p>
        ) : (
          <>
            <p className="docs-page-description">
              {`This skill isn't in the registry index anymore. It may have been renamed or removed from ${target.registry}.`}
            </p>
            <p className="registry-skill-actions">
              <BackToResults />
            </p>
          </>
        )}
      </Shell>
    );
  }

  const linkBase = `https://github.com/${skill.registry}/blob/HEAD/${skill.path}/`;
  const imageBase = `https://raw.githubusercontent.com/${skill.registry}/HEAD/${skill.path}/`;
  const current = file && file.url === fileUrl ? file : null;

  return (
    <Shell crumb={skill.name}>
      <header className="docs-page-header">
        <p className="skill-eyebrow">Registry skill</p>
        <h1 className="registry-skill-title">{skill.name}</h1>
        <p className="registry-skill-source">
          From{' '}
          <a href={`https://github.com/${skill.registry}`} target="_blank" rel="noopener noreferrer">
            {skill.registry}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
        <p className="docs-page-description">{skill.description}</p>
      </header>

      <section className="registry-skill-install" aria-labelledby="install-command">
        <h2 id="install-command">Install command</h2>
        <p>Installs into the current project. Add <code>--global</code> to install it for every project.</p>
        <CodeBlock language="bash">
          <pre>
            <code>{`npx ai-devkit@latest skill add ${skill.registry} ${skill.name}`}</code>
          </pre>
        </CodeBlock>
      </section>

      <section className="registry-skill-file-section" aria-labelledby="skill-file">
        <h2 id="skill-file">The SKILL.md file</h2>
        <p>
          This is what your agent reads when the skill runs. It comes from {skill.registry}, not AI DevKit.{' '}
          <a href={skillGithubUrl(skill)} target="_blank" rel="noopener noreferrer">
            View it on GitHub
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
        <div className="skill-file">
          <p className="skill-file-path" aria-hidden="true">
            {skill.registry}/{skill.path}/SKILL.md
          </p>
          {(!current || current.status === 'loading') && (
            <p className="registry-status" role="status">Loading SKILL.md…</p>
          )}
          {current?.status === 'error' && (
            <p className="registry-file-error" role="status">
              {`Couldn't load SKILL.md from GitHub. `}
              <a href={skillGithubUrl(skill)} target="_blank" rel="noopener noreferrer">
                Open it on GitHub
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          )}
          {current?.status === 'ready' && (
            <SafeMarkdown markdown={current.text} linkBase={linkBase} imageBase={imageBase} />
          )}
        </div>
      </section>

      <p className="registry-skill-actions">
        <BackToResults />
      </p>
    </Shell>
  );
}
