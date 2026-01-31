import { notFound } from "next/navigation";
import type { Metadata } from "next";
import MarkdownContent from "@/components/MarkdownContent";
import { getDocPage } from "@/lib/content/loader";
import {
  findSetupToolBySlug,
  setupToolEntries,
} from "@/lib/seo/setup-tools";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-devkit.com";
const baseDocSlug = "1-getting-started";

interface SetupPageProps {
  params: Promise<{ tool: string }>;
}

function buildTitle(tool: string): string {
  return `Setting up AI DevKit for ${tool}`;
}

function buildDescription(tool: string): string {
  return `Set up AI DevKit for ${tool} with structured workflows, commands, and memory to keep AI-assisted development consistent.`;
}

function buildSeoContent(tool: string, baseContent: string): string {
  const intro = [
    "",
    `Learn how to set up AI DevKit for **${tool}** so your team can rely on consistent AI-assisted workflows.`,
    "",
    `AI DevKit adds structured phases, reusable commands, and memory to ${tool} so every project follows the same playbook.`,
    "",
    "## What you'll configure",
    "",
    "- Project initialization and environment selection",
    "- AI editor files like rules, agents, and commands",
    "- Memory and skills for repeatable workflows",
    "",
  ].join("\n");

  const outro = [
    "",
    "## Next steps",
    "",
    `Once AI DevKit is set up in ${tool}, follow the getting started guide and run your first workflow command.`,
  ].join("\n");

  return `${intro}${baseContent}${outro}`;
}

export async function generateStaticParams() {
  return setupToolEntries.map((entry) => ({
    tool: entry.slug,
  }));
}

export async function generateMetadata({
  params,
}: SetupPageProps): Promise<Metadata> {
  const { tool: slug } = await params;
  const entry = findSetupToolBySlug(slug);

  if (!entry) {
    return {
      title: "Page Not Found",
      description: "The requested setup page could not be found.",
    };
  }

  const title = buildTitle(entry.tool);
  const description = buildDescription(entry.tool);
  const pageUrl = `${siteUrl}/faq/getting-started/${entry.slug}`;

  return {
    title,
    description,
    keywords: [
      title,
      entry.tool,
      "AI DevKit",
      "AI coding assistant",
      "setup guide",
      "structured workflows",
      "commands",
      "memory",
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

export default async function SetupToolPage({ params }: SetupPageProps) {
  const { tool: slug } = await params;
  const entry = findSetupToolBySlug(slug);

  if (!entry) {
    notFound();
  }

  const baseDoc = getDocPage(baseDocSlug);
  const baseContent =
    baseDoc?.content ||
    "AI DevKit provides structured workflows, reusable commands, and memory to improve AI-assisted development.";

  const content = buildSeoContent(entry.tool, baseContent);
  const pageUrl = `${siteUrl}/faq/getting-started/${entry.slug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: buildTitle(entry.tool),
    description: buildDescription(entry.tool),
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
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          {buildTitle(entry.tool)}
        </h1>
        <p className="text-xl text-gray-600 mb-12">
          {buildDescription(entry.tool)}
        </p>
        <MarkdownContent content={content} />
      </article>
    </div>
  );
}
