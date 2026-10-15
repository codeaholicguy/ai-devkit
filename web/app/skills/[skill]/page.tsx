import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { builtInSkills, getBuiltInSkill } from "@/lib/skills/built-in";
import { SKILL_GROUPS } from "@/lib/skills/groups";
import { getSkillMarkdown } from "@/lib/skills/skill-markdown";
import { extractHeadings, type DocHeading } from "@/lib/docs/nav";
import { REPO_URL } from "@/lib/utils";
import CodeBlock from "@/components/docs/CodeBlock";
import DocContent from "@/components/docs/DocContent";
import { TocAside, TocInline } from "@/components/docs/Toc";
import CopyToMarkdownButton from "@/components/CopyToMarkdownButton";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-devkit.com";

interface SkillPageProps {
  params: Promise<{ skill: string }>;
}

export function generateStaticParams() {
  return builtInSkills.map((skill) => ({
    skill: skill.name,
  }));
}

export async function generateMetadata({
  params,
}: SkillPageProps): Promise<Metadata> {
  const { skill: slug } = await params;
  const skill = getBuiltInSkill(slug);

  if (!skill) {
    return {
      title: "Skill Not Found",
      description: "The requested AI DevKit skill could not be found.",
    };
  }

  const title = `${skill.title} Skill for AI Coding Agents | AI DevKit`;
  const description = `${skill.summary} Install the ${skill.name} skill for Claude Code, Codex, Cursor, opencode, Gemini CLI, and other supported AI coding agents.`;
  const pageUrl = `${siteUrl}/skills/${skill.name}/`;

  return {
    title,
    description,
    keywords: [
      skill.name,
      `${skill.name} skill`,
      "AI DevKit",
      "AI coding agent skills",
      "Claude Code skills",
      "Codex skills",
      "Cursor skills",
      "opencode skills",
    ],
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "AI DevKit",
      locale: "en_US",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    alternates: {
      canonical: pageUrl,
    },
  };
}

export default async function SkillDetailPage({ params }: SkillPageProps) {
  const { skill: slug } = await params;
  const skill = getBuiltInSkill(slug);

  if (!skill) {
    notFound();
  }

  const pageUrl = `${siteUrl}/skills/${skill.name}/`;
  const installCommand = `npx ai-devkit@latest skill add --built-in`;
  const relatedSkills = builtInSkills
    .filter(
      (candidate) =>
        candidate.name !== skill.name && candidate.category === skill.category
    )
    .concat(builtInSkills.filter((candidate) => candidate.name !== skill.name))
    .filter(
      (candidate, index, candidates) =>
        candidates.findIndex((item) => item.name === candidate.name) === index
    )
    .slice(0, 4);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: `${skill.title} Skill`,
        description: skill.description,
        url: pageUrl,
        author: {
          "@type": "Organization",
          name: "AI DevKit",
        },
        publisher: {
          "@type": "Organization",
          name: "AI DevKit",
          url: siteUrl,
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
          {
            "@type": "ListItem",
            position: 2,
            name: "Skills",
            item: `${siteUrl}/skills/`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: `${skill.title} Skill`,
            item: pageUrl,
          },
        ],
      },
    ],
  };

  const group = SKILL_GROUPS.find((candidate) => candidate.categories.includes(skill.category));
  const skillMarkdown = getSkillMarkdown(skill.name);
  const headings: DocHeading[] = [
    { id: "install-command", text: "Install command", depth: 2 },
    { id: "what-it-does", text: "What it does", depth: 2 },
    { id: "when-to-use-it", text: "When to use it", depth: 2 },
    { id: "supported-agents", text: "Supported agents", depth: 2 },
    ...(skillMarkdown
      ? [
          { id: "skill-file", text: "The SKILL.md file", depth: 2 as const },
          ...extractHeadings(skillMarkdown).filter((heading) => heading.depth === 3),
        ]
      : []),
    { id: "related-skills", text: "Related skills", depth: 2 },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="faq-shell">
        <article className="faq-shell-content" data-pagefind-body>
          <nav aria-label="Breadcrumb" className="docs-breadcrumb" data-pagefind-ignore>
            <ol>
              <li>
                <Link href="/skills">Skills</Link>
              </li>
              {group && (
                <li>
                  <Link href={`/skills#${group.id}`}>{group.title}</Link>
                </li>
              )}
              <li aria-current="page">{skill.title}</li>
            </ol>
          </nav>

          <header className="docs-page-header">
            <p className="skill-eyebrow">{skill.category} skill</p>
            <h1>{skill.title} Skill</h1>
            <p className="docs-page-description">{skill.summary}</p>
            <div className="docs-page-actions" data-pagefind-ignore>
              <CopyToMarkdownButton
                content={skillMarkdown ?? skill.description}
                title={`${skill.title} Skill`}
              />
            </div>
          </header>

          <TocInline headings={headings} />

          <div className="doc-prose">
            <section aria-labelledby="install-command">
              <h2 id="install-command">Install command</h2>
              <p>
                AI DevKit installs its built-in skills as one curated set. Run this once to install{" "}
                <code>{skill.name}</code> with the rest of the built-in workflow skills.
              </p>
              <CodeBlock language="bash">
                <pre>
                  <code>{installCommand}</code>
                </pre>
              </CodeBlock>
            </section>

            <section aria-labelledby="what-it-does">
              <h2 id="what-it-does">What it does</h2>
              <p>{skill.description}</p>
            </section>

            <section aria-labelledby="when-to-use-it">
              <h2 id="when-to-use-it">When to use it</h2>
              <ul>
                {skill.useCases.map((useCase) => (
                  <li key={useCase}>{useCase}</li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="supported-agents">
              <h2 id="supported-agents">Supported agents</h2>
              <ul className="skill-agents">
                {skill.relatedAgents.map((agent) => (
                  <li key={agent}>{agent}</li>
                ))}
              </ul>
            </section>

            {skillMarkdown && (
              <section aria-labelledby="skill-file">
                <h2 id="skill-file">The SKILL.md file</h2>
                <p>
                  This is what your agent reads when the skill runs.{" "}
                  <a
                    href={`${REPO_URL}/blob/main/skills/${skill.name}/SKILL.md`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View it on GitHub
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </p>
              </section>
            )}
          </div>

          {skillMarkdown && (
            <div className="skill-file">
              <p className="skill-file-path" aria-hidden="true">skills/{skill.name}/SKILL.md</p>
              <DocContent content={skillMarkdown} format="md" />
            </div>
          )}

          <section className="skill-related" aria-labelledby="related-skills">
            <h2 id="related-skills">Related skills</h2>
            <ul className="faq-home-cards">
              {relatedSkills.map((relatedSkill) => (
                <li key={relatedSkill.name}>
                  <Link href={`/skills/${relatedSkill.name}`} className="faq-home-card">
                    <span className="skill-card-category">{relatedSkill.category}</span>
                    <span className="faq-home-card-title">{relatedSkill.title}</span>
                    <span className="faq-home-card-desc">{relatedSkill.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <nav aria-label="More about skills" className="docs-pager skill-pager" data-pagefind-ignore>
            <Link href="/skills" className="docs-pager-link">
              <span className="docs-pager-label">Back to</span>
              <span className="docs-pager-title">Browse all AI coding agent skills</span>
            </Link>
            <Link href="/docs/7-skills" className="docs-pager-link docs-pager-next">
              <span className="docs-pager-label">Read the guide</span>
              <span className="docs-pager-title">Install and manage skills</span>
            </Link>
          </nav>
        </article>

        <aside className="docs-shell-toc">
          <TocAside headings={headings} />
        </aside>
      </div>
    </>
  );
}
