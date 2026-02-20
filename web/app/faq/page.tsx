import type { Metadata } from "next";
import Link from "next/link";
import { getAllFaqPages } from "@/lib/content/loader";
import { seoKeywordEntries } from "@/lib/seo/keywords";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-devkit.com";

export const metadata: Metadata = {
  title: "FAQ | AI DevKit",
  description:
    "Browse AI DevKit FAQ topics covering AI coding assistants, workflows, and development best practices.",
  keywords: [
    "AI DevKit FAQ",
    "AI coding assistant",
    "AI development tools",
    "structured workflows",
    "commands",
    "memory",
  ],
  openGraph: {
    title: "AI DevKit FAQ",
    description:
      "Browse AI DevKit FAQ topics covering AI coding assistants, workflows, and development best practices.",
    url: `${siteUrl}/faq`,
    siteName: "AI DevKit",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI DevKit FAQ",
    description:
      "Browse AI DevKit FAQ topics covering AI coding assistants, workflows, and development best practices.",
  },
  alternates: {
    canonical: `${siteUrl}/faq`,
  },
};

export default function FaqIndexPage() {
  const faqPages = getAllFaqPages();

  return (
    <div className="bg-white py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-4">FAQ</h1>
        <p className="text-xl text-gray-600 mb-12">
          Explore AI DevKit topics focused on AI coding assistants, workflows,
          and tools.
        </p>

        {faqPages.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Detailed FAQ Articles</h2>
            <div className="space-y-4">
              {faqPages.map((page) => (
                <Link
                  key={page.metadata.slug}
                  href={`/faq/${page.metadata.slug}`}
                  className="block rounded-lg border border-gray-200 px-6 py-4 transition-colors hover:border-black no-underline"
                >
                  <h3 className="text-lg font-semibold mb-1">{page.metadata.title}</h3>
                  <p className="text-gray-600">{page.metadata.description}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-2xl font-bold mb-4">Popular Topics</h2>
          <div className="space-y-4">
            {seoKeywordEntries.map((entry) => (
              <Link
                key={entry.slug}
                href={`/faq/${entry.slug}`}
                className="block rounded-lg border border-gray-200 px-6 py-4 text-lg font-semibold transition-colors hover:border-black no-underline"
              >
                {entry.keyword}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
