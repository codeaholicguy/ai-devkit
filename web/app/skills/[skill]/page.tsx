import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { builtInSkills, getBuiltInSkill } from "@/lib/skills/built-in";

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
  };

  return (
    <div className="bg-white py-16">
      <article className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />

        <nav className="mb-8 text-sm text-gray-600">
          <Link href="/skills" className="transition-colors hover:text-black">
            Skills
          </Link>
          <span className="mx-2">/</span>
          <span className="text-black">{skill.title}</span>
        </nav>

        <div className="mb-10">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {skill.category} skill
          </p>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            {skill.title} Skill
          </h1>
          <p className="mt-5 text-xl leading-8 text-gray-600">
            {skill.summary}
          </p>
        </div>

        <section className="mb-10 rounded-lg border border-gray-200 bg-gray-50 p-6">
          <h2 className="text-lg font-semibold">Install command</h2>
          <p className="mt-2 text-gray-600">
            AI DevKit installs its built-in skills as one curated set. Run this once to install{" "}
            <span className="font-mono">{skill.name}</span> with the rest of the built-in workflow skills.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-gray-950 p-4 text-sm text-white">
            <code>{installCommand}</code>
          </pre>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold">What it does</h2>
          <p className="mt-4 leading-7 text-gray-700">{skill.description}</p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold">When to use it</h2>
          <ul className="mt-4 space-y-3">
            {skill.useCases.map((useCase) => (
              <li key={useCase} className="flex gap-3 text-gray-700">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-gray-950" />
                <span>{useCase}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold">Supported agents</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {skill.relatedAgents.map((agent) => (
              <span
                key={agent}
                className="rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-700"
              >
                {agent}
              </span>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold">Related skills</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {relatedSkills.map((relatedSkill) => (
              <Link
                key={relatedSkill.name}
                href={`/skills/${relatedSkill.name}`}
                className="rounded-lg border border-gray-200 p-4 no-underline transition-colors hover:border-black"
              >
                <div className="text-sm text-gray-600">{relatedSkill.category}</div>
                <div className="font-bold text-gray-950">{relatedSkill.title}</div>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-600">
                  {relatedSkill.summary}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <nav className="grid gap-4 border-t border-gray-200 pt-8 md:grid-cols-2">
          <Link
            href="/skills"
            className="rounded-lg border border-gray-200 p-4 no-underline transition-colors hover:border-black"
          >
            <div className="text-sm text-gray-600">Back to</div>
            <div className="font-bold">Browse all AI coding agent skills</div>
          </Link>
          <Link
            href="/docs/7-skills"
            className="rounded-lg border border-gray-200 p-4 text-left no-underline transition-colors hover:border-black md:text-right"
          >
            <div className="text-sm text-gray-600">Read the guide</div>
            <div className="font-bold">Install and manage skills</div>
          </Link>
        </nav>
      </article>
    </div>
  );
}
