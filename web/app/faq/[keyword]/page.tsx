import { notFound } from "next/navigation";
import type { Metadata } from "next";
import MarkdownContent from "@/components/MarkdownContent";
import FaqKeywordLinks from "@/components/FaqKeywordLinks";
import { getDocPage } from "@/lib/content/loader";
import {
  findSeoKeywordBySlug,
  seoKeywordEntries,
} from "@/lib/seo/keywords";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-devkit.com";
const baseDocSlug = "1-getting-started";

interface SeoPageProps {
  params: Promise<{ keyword: string }>;
}

function buildSeoContent(keyword: string, baseContent: string): string {
  const intro = [
    "",
    `If you're researching **${keyword}**, AI DevKit helps you standardize workflows with commands, documentation, and memory so your team can ship with AI assistants reliably.`,
    "",
  ].join("\n");

  const outro = [
    "",
    `## ${keyword} with AI DevKit`,
    "",
    `Use AI DevKit to organize requirements, design, planning, implementation, and testing so ${keyword} stays consistent across features and teams.`,
  ].join("\n");

  return `${intro}${baseContent}${outro}`;
}

function buildDescription(keyword: string): string {
  return `Explore ${keyword} with AI DevKit. Structured workflows, commands, and memory that help teams build consistently with AI coding assistants.`;
}

export async function generateStaticParams() {
  return seoKeywordEntries.map((entry) => ({
    keyword: entry.slug,
  }));
}

export async function generateMetadata({
  params,
}: SeoPageProps): Promise<Metadata> {
  const { keyword: slug } = await params;
  const entry = findSeoKeywordBySlug(slug);

  if (!entry) {
    return {
      title: "Page Not Found",
      description: "The requested FAQ page could not be found.",
    };
  }

  const title = `${entry.keyword} | AI DevKit`;
  const description = buildDescription(entry.keyword);
  const pageUrl = `${siteUrl}/faq/${entry.slug}`;

  return {
    title,
    description,
    keywords: [
      entry.keyword,
      "AI DevKit",
      "AI coding assistant",
      "AI development tools",
      "structured workflows",
      "coding assistant",
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

export default async function SeoKeywordPage({ params }: SeoPageProps) {
  const { keyword: slug } = await params;
  const entry = findSeoKeywordBySlug(slug);

  if (!entry) {
    notFound();
  }

  const baseDoc = getDocPage(baseDocSlug);
  const baseContent =
    baseDoc?.content ||
    "AI DevKit provides structured workflows, reusable commands, and memory to improve AI-assisted development.";

  const content = buildSeoContent(entry.keyword, baseContent);
  const pageUrl = `${siteUrl}/faq/${entry.slug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: entry.keyword,
    description: buildDescription(entry.keyword),
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
          {entry.keyword}
        </h1>
        <p className="text-xl text-gray-600 mb-12">
          {buildDescription(entry.keyword)}
        </p>
        <MarkdownContent content={content} />
        <FaqKeywordLinks />
      </article>
    </div>
  );
}
