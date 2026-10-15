import { notFound } from "next/navigation";
import Link from "next/link";
import { getDocPage, getAllDocPages } from "@/lib/content/loader";
import { extractHeadings, getDocsNav } from "@/lib/docs/nav";
import { getSection } from "@/lib/docs/sections";
import { REPO_URL } from "@/lib/utils";
import DocContent from "@/components/docs/DocContent";
import DocsSidebar from "@/components/docs/DocsSidebar";
import MobileDocsNav from "@/components/docs/MobileDocsNav";
import SearchButton from "@/components/docs/SearchButton";
import { TocAside, TocInline } from "@/components/docs/Toc";
import CopyToMarkdownButton from "@/components/CopyToMarkdownButton";
import GettingStartedGuides from "@/components/GettingStartedGuides";
import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-devkit.com";

// Pages where the per-tool setup guides help; elsewhere they repeat noise.
const SETUP_GUIDE_PAGES = new Set(["1-getting-started", "2-supported-agents"]);

// The outline earns its space only on pages with a few sections.
const MIN_TOC_SECTIONS = 3;

interface DocPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const docs = getAllDocPages();
  return docs.map((doc) => ({
    slug: doc.metadata.slug,
  }));
}

export async function generateMetadata({
  params,
}: DocPageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocPage(slug);

  if (!doc) {
    return {
      title: "Page Not Found",
      description: "The requested documentation page could not be found.",
    };
  }

  const pageUrl = `${siteUrl}/docs/${slug}`;
  const title = doc.metadata.title;
  const description =
    doc.metadata.description ||
    `Learn about ${doc.metadata.title} in the AI DevKit documentation.`;

  return {
    title,
    description,
    keywords: [
      doc.metadata.title,
      "AI DevKit",
      "documentation",
      "AI coding agents",
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

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params;
  const doc = getDocPage(slug);

  if (!doc) {
    notFound();
  }

  const allDocs = getAllDocPages();
  const nav = getDocsNav(allDocs);
  const currentIndex = allDocs.findIndex((d) => d.metadata.slug === slug);
  const prevDoc = currentIndex > 0 ? allDocs[currentIndex - 1] : null;
  const nextDoc =
    currentIndex < allDocs.length - 1 ? allDocs[currentIndex + 1] : null;
  const section = getSection(doc.metadata.section);
  const headings = extractHeadings(doc.content);
  const showToc =
    headings.filter((heading) => heading.depth === 2).length >= MIN_TOC_SECTIONS;

  const pageUrl = `${siteUrl}/docs/${slug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: doc.metadata.title,
        description: doc.metadata.description,
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
            name: "Documentation",
            item: `${siteUrl}/docs/`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: doc.metadata.title,
            item: pageUrl,
          },
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
      <MobileDocsNav
        key={slug}
        sectionTitle={section?.title}
        pageTitle={doc.metadata.title}
      >
        <DocsSidebar nav={nav} currentSlug={slug} />
      </MobileDocsNav>

      <div className="docs-shell">
        <aside className="docs-shell-sidebar">
          <a href="#doc-content" className="docs-skip">
            Skip to page content
          </a>
          <SearchButton />
          <DocsSidebar nav={nav} currentSlug={slug} />
        </aside>

        <article id="doc-content" className="docs-shell-content" data-pagefind-body>
          <nav aria-label="Breadcrumb" className="docs-breadcrumb" data-pagefind-ignore>
            <ol>
              <li>
                <Link href="/docs">Docs</Link>
              </li>
              {section && (
                <li>
                  <Link href={`/docs#${section.id}`}>{section.title}</Link>
                </li>
              )}
              <li aria-current="page">{doc.metadata.title}</li>
            </ol>
          </nav>

          <header className="docs-page-header">
            <h1>{doc.metadata.title}</h1>
            {doc.metadata.description && (
              <p className="docs-page-description">{doc.metadata.description}</p>
            )}
            <div className="docs-page-actions" data-pagefind-ignore>
              <CopyToMarkdownButton
                content={doc.content}
                title={doc.metadata.title}
              />
            </div>
          </header>

          {showToc && <TocInline headings={headings} />}

          <DocContent content={doc.content} />

          {SETUP_GUIDE_PAGES.has(slug) && <GettingStartedGuides />}

          <footer className="docs-page-footer" data-pagefind-ignore>
            <nav aria-label="Previous and next pages" className="docs-pager">
              {prevDoc ? (
                <Link href={`/docs/${prevDoc.metadata.slug}`} className="docs-pager-link">
                  <span className="docs-pager-label">
                    ← Previous · {getSection(prevDoc.metadata.section)?.title}
                  </span>
                  <span className="docs-pager-title">{prevDoc.metadata.title}</span>
                </Link>
              ) : (
                <span />
              )}
              {nextDoc && (
                <Link
                  href={`/docs/${nextDoc.metadata.slug}`}
                  className="docs-pager-link docs-pager-next"
                >
                  <span className="docs-pager-label">
                    Next · {getSection(nextDoc.metadata.section)?.title} →
                  </span>
                  <span className="docs-pager-title">{nextDoc.metadata.title}</span>
                </Link>
              )}
            </nav>
            <a
              href={`${REPO_URL}/blob/main/web/content/docs/${slug}.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="docs-edit-link"
            >
              Edit this page on GitHub
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </footer>
        </article>

        {showToc && (
          <aside className="docs-shell-toc">
            <TocAside headings={headings} />
          </aside>
        )}
      </div>
    </>
  );
}
