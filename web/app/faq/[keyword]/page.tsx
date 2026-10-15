import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import FaqKeywordLinks from "@/components/FaqKeywordLinks";
import FaqPageShell from "@/components/faq/FaqPageShell";
import TryIt from "@/components/faq/TryIt";
import { getFaqCategory } from "@/lib/faq/structure";
import { getAllFaqPages, getDocPage, getFaqPage } from "@/lib/content/loader";
import {
  clusterDocSlugs,
  findSeoKeywordBySlug,
  getSeoClusterLinks,
  seoKeywordEntries,
} from "@/lib/seo/keywords";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-devkit.com";

interface SeoPageProps {
  params: Promise<{ keyword: string }>;
}

function buildSeoContent(keyword: string, baseContent: string): string {
  const intro = [
    "",
    `If you're researching **${keyword}**, AI DevKit gives your AI coding agents one control plane for setup, console supervision, local-first memory, communication, workflow skills, and verification.`,
    "",
  ].join("\n");

  const outro = [
    "",
    `## ${keyword} with AI DevKit`,
    "",
    `Use AI DevKit to keep ${keyword} consistent across features and teams: one config, one local console, shared memory, and the same verification workflow across supported agents.`,
  ].join("\n");

  return `${intro}${baseContent}${outro}`;
}

function buildDescription(keyword: string): string {
  return `Explore ${keyword} with AI DevKit: local setup, console, memory, communication, workflow skills, and verification for AI coding agents.`;
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
        "AI agent control plane",
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

  // The root layout's title template appends "| AI DevKit"; social titles keep it explicitly.
  const title = `${entry.keyword} | AI DevKit`;
  const description = buildDescription(entry.keyword);
  const pageUrl = `${siteUrl}/faq/${entry.slug}`;

  return {
    title: entry.keyword,
    description,
    keywords: [
      entry.keyword,
      "AI DevKit",
      "AI coding assistant",
      "AI development tools",
      "AI agent control plane",
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
    const category = getFaqCategory(faqPage.metadata.category);
    const structuredData = {
      "@context": "https://schema.org",
      "@graph": [
        {
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
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
            { "@type": "ListItem", position: 2, name: "FAQ", item: `${siteUrl}/faq/` },
            { "@type": "ListItem", position: 3, name: faqPage.metadata.title, item: pageUrl },
          ],
        },
      ],
    };

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <FaqPageShell
          breadcrumb={[
            { label: "FAQ", href: "/faq" },
            ...(category ? [{ label: category.title, href: `/faq#${category.id}` }] : []),
          ]}
          title={faqPage.metadata.title}
          description={faqPage.metadata.description}
          content={faqPage.content}
          searchable
        >
          <TryIt />
          <FaqKeywordLinks currentSlug={slug} />
        </FaqPageShell>
      </>
    );
  }

  const entry = findSeoKeywordBySlug(slug);

  if (!entry) {
    notFound();
  }

  const baseDoc = getDocPage(clusterDocSlugs[entry.cluster]);
  const baseContent =
    baseDoc?.content ||
    "AI DevKit gives AI coding agents one control plane with setup, console supervision, local-first memory, communication, workflow skills, and verification.";

  const content = buildSeoContent(entry.keyword, baseContent);
  const relatedLinks = getSeoClusterLinks(entry.cluster);
  const pageUrl = `${siteUrl}/faq/${entry.slug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
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
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
          { "@type": "ListItem", position: 2, name: "FAQ", item: `${siteUrl}/faq/` },
          { "@type": "ListItem", position: 3, name: entry.keyword, item: pageUrl },
        ],
      },
    ],
  };

  const sourceDocSlug = clusterDocSlugs[entry.cluster];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <FaqPageShell
        breadcrumb={[
          { label: "FAQ", href: "/faq" },
          { label: "Topics", href: "/faq#topics" },
        ]}
        title={entry.keyword}
        description={buildDescription(entry.keyword)}
        content={content}
        intro={
          baseDoc && (
            <p className="faq-source">
              From the docs:{" "}
              <Link href={`/docs/${sourceDocSlug}`}>{baseDoc.metadata.title}</Link>
            </p>
          )
        }
      >
        <TryIt />
        <section className="faq-related" aria-labelledby="related-guides" data-pagefind-ignore>
          <h2 id="related-guides">Related guides</h2>
          <ul>
            {relatedLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </section>
        <FaqKeywordLinks currentSlug={entry.slug} />
      </FaqPageShell>
    </>
  );
}
