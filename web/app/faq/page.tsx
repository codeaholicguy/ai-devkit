import type { Metadata } from "next";
import Link from "next/link";
import { getAllFaqPages } from "@/lib/content/loader";
import { seoKeywordEntries } from "@/lib/seo/keywords";
import { FAQ_CATEGORIES, TOPIC_GROUPS } from "@/lib/faq/structure";
import SearchButton from "@/components/docs/SearchButton";
import GettingStartedGuides from "@/components/GettingStartedGuides";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-devkit.com";

const description =
  "Browse AI DevKit FAQ topics about operating AI coding agents with one local config, console, memory layer, communication path, and verification workflow.";

export const metadata: Metadata = {
  // The root layout's title template appends "| AI DevKit".
  title: "FAQ",
  description,
  keywords: [
    "AI DevKit FAQ",
    "AI coding assistant",
    "AI development tools",
    "AI agent control plane",
    "commands",
    "memory",
  ],
  openGraph: {
    title: "AI DevKit FAQ",
    description:
      "Browse AI DevKit FAQ topics about local agent setup, console, memory, communication, workflow skills, and verification.",
    url: `${siteUrl}/faq`,
    siteName: "AI DevKit",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI DevKit FAQ",
    description:
      "Browse AI DevKit FAQ topics about local agent setup, console, memory, communication, workflow skills, and verification.",
  },
  alternates: {
    canonical: `${siteUrl}/faq`,
  },
};

// Articles without a known category still get listed, under Guides.
function categoryOf(category?: string): string {
  return FAQ_CATEGORIES.some((c) => c.id === category) ? (category as string) : "guide";
}

export default function FaqIndexPage() {
  const faqPages = getAllFaqPages();
  const pageUrl = `${siteUrl}/faq/`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "AI DevKit FAQ",
        description,
        url: pageUrl,
        mainEntity: {
          "@type": "ItemList",
          itemListElement: faqPages.map((page, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: page.metadata.title,
            url: `${siteUrl}/faq/${page.metadata.slug}/`,
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
          { "@type": "ListItem", position: 2, name: "FAQ", item: pageUrl },
        ],
      },
    ],
  };

  return (
    <div className="docs-home faq-home">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <header className="docs-home-hero">
        <p className="docs-home-eyebrow">FAQ</p>
        <h1>AI DevKit FAQ</h1>
        <p className="docs-home-lede">
          Explore how AI DevKit gives AI coding agents one local setup,
          console, memory layer, communication path, and verification workflow.
        </p>
        <div className="docs-home-search">
          <SearchButton label="Search docs and FAQ" />
        </div>
      </header>

      {FAQ_CATEGORIES.map((category) => {
        const pages = faqPages.filter((page) => categoryOf(page.metadata.category) === category.id);
        if (pages.length === 0) return null;
        return (
          <section
            key={category.id}
            id={category.id}
            className="faq-home-group"
            aria-labelledby={`${category.id}-title`}
          >
            <h2 id={`${category.id}-title`}>{category.title}</h2>
            <p className="faq-home-group-desc">{category.description}</p>
            <ul className="faq-home-cards">
              {pages.map((page) => (
                <li key={page.metadata.slug}>
                  <Link href={`/faq/${page.metadata.slug}`} className="faq-home-card">
                    <h3 className="faq-home-card-title">{page.metadata.title}</h3>
                    <span className="faq-home-card-desc">{page.metadata.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <div id="setup" className="faq-home-group">
        <GettingStartedGuides />
      </div>

      <section id="topics" className="faq-home-group" aria-labelledby="topics-title">
        <h2 id="topics-title">Popular Topics</h2>
        <p className="faq-home-group-desc">Common questions about running AI coding agents, by area.</p>
        <div className="faq-topics">
          {TOPIC_GROUPS.map((group) => {
            const entries = seoKeywordEntries.filter((entry) => entry.cluster === group.cluster);
            if (entries.length === 0) return null;
            return (
              <div key={group.cluster} className="faq-topic-group">
                <h3>{group.title}</h3>
                <ul>
                  {entries.map((entry) => (
                    <li key={entry.slug}>
                      <Link href={`/faq/${entry.slug}`}>{entry.keyword}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
