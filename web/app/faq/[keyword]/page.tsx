import { notFound } from "next/navigation";
import type { Metadata } from "next";
import MarkdownContent from "@/components/MarkdownContent";
import FaqKeywordLinks from "@/components/FaqKeywordLinks";
import { getAllFaqPages, getDocPage, getFaqPage } from "@/lib/content/loader";
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
    `If you're researching **${keyword}**, AI DevKit helps your AI coding agents follow a repeatable engineering workflow with planning, memory, verification, skills, and review.`,
    "",
  ].join("\n");

  const outro = [
    "",
    `## ${keyword} with AI DevKit`,
    "",
    `Use AI DevKit to keep ${keyword} consistent across features and teams: one config, all agents, same workflow.`,
  ].join("\n");

  return `${intro}${baseContent}${outro}`;
}

function buildDescription(keyword: string): string {
  return `Explore ${keyword} with AI DevKit. Planning, memory, verification, skills, and review for AI coding agents.`;
}

export async function generateStaticParams() {
  const seoParams = seoKeywordEntries.map((entry) => entry.slug);
  const faqParams = getAllFaqPages().map((page) => page.metadata.slug);
  const uniqueSlugs = Array.from(new Set([...seoParams, ...faqParams]));

  return uniqueSlugs.map((keyword) => ({ keyword }));
}

export async function generateMetadata({
  params,
}: SeoPageProps): Promise<Metadata> {
  const { keyword: slug } = await params;
  const faqPage = getFaqPage(slug);

  if (faqPage) {
    const pageUrl = `${siteUrl}/faq/${slug}`;

    return {
      title: faqPage.metadata.title,
      description: faqPage.metadata.description,
      keywords: [
        faqPage.metadata.title,
        "AI DevKit FAQ",
        "AI coding tools comparison",
        "AI development tools",
        "repeatable engineering workflow",
      ],
      openGraph: {
        title: faqPage.metadata.title,
        description: faqPage.metadata.description,
        url: pageUrl,
        siteName: "AI DevKit",
        locale: "en_US",
        type: "article",
      },
      twitter: {
        card: "summary_large_image",
        title: faqPage.metadata.title,
        description: faqPage.metadata.description,
      },
      alternates: {
        canonical: pageUrl,
      },
    };
  }

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
      "repeatable engineering workflow",
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
  const faqPage = getFaqPage(slug);

  if (faqPage) {
    const pageUrl = `${siteUrl}/faq/${slug}`;
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: faqPage.metadata.title,
      description: faqPage.metadata.description,
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
            {faqPage.metadata.title}
          </h1>
          <p className="text-xl text-gray-600 mb-12">
            {faqPage.metadata.description}
          </p>
          <MarkdownContent content={faqPage.content} />
          <FaqKeywordLinks />
        </article>
      </div>
    );
  }

  const entry = findSeoKeywordBySlug(slug);

  if (!entry) {
    notFound();
  }

  const baseDoc = getDocPage(baseDocSlug);
  const baseContent =
    baseDoc?.content ||
    "AI DevKit makes AI coding agents follow a repeatable engineering workflow with planning, memory, verification, skills, and review.";

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
