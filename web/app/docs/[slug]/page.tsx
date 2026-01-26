import { notFound } from "next/navigation";
import Link from "next/link";
import { getDocPage, getAllDocPages } from "@/lib/content/loader";
import MarkdownContent from "@/components/MarkdownContent";
import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-devkit.com";

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
      "AI-assisted development",
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

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params;
  const doc = getDocPage(slug);

  if (!doc) {
    notFound();
  }

  const allDocs = getAllDocPages();
  const currentIndex = allDocs.findIndex((d) => d.metadata.slug === slug);
  const prevDoc = currentIndex > 0 ? allDocs[currentIndex - 1] : null;
  const nextDoc =
    currentIndex < allDocs.length - 1 ? allDocs[currentIndex + 1] : null;

  return (
    <div className="bg-white py-16">
      <article className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <nav className="mb-8 text-sm text-gray-600">
          <Link href="/docs" className="hover:text-black transition-colors">
            Documentation
          </Link>
          <span className="mx-2">/</span>
          <span className="text-black">{doc.metadata.title}</span>
        </nav>

        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          {doc.metadata.title}
        </h1>

        {doc.metadata.description && (
          <p className="text-xl text-gray-600 mb-12">
            {doc.metadata.description}
          </p>
        )}

        <MarkdownContent content={doc.content} />
      </article>
      <nav className="mt-16 pt-8 border-t border-gray-200 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {prevDoc ? (
            <Link
              href={`/docs/${prevDoc.metadata.slug}`}
              className="p-4 border border-gray-200 rounded-lg hover:border-black transition-colors no-underline group"
            >
              <div className="text-sm text-gray-600 mb-1">Previous</div>
              <div className="font-bold group-hover:opacity-70 transition-opacity">
                ← {prevDoc.metadata.title}
              </div>
            </Link>
          ) : (
            <div />
          )}
          {nextDoc && (
            <Link
              href={`/docs/${nextDoc.metadata.slug}`}
              className="p-4 border border-gray-200 rounded-lg hover:border-black transition-colors no-underline text-right group"
            >
              <div className="text-sm text-gray-600 mb-1">Next</div>
              <div className="font-bold group-hover:opacity-70 transition-opacity">
                {nextDoc.metadata.title} →
              </div>
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
