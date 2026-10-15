import Link from "next/link";
import { getPage } from "@/lib/content/loader";
import MarkdownContent from "@/components/MarkdownContent";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-devkit.com";

export const metadata: Metadata = {
  title: "Vision",
  description:
    "The vision behind AI DevKit: turn scattered AI coding agents into one local system for setup, memory, communication, workflow skills, and verification.",
  keywords: [
    "AI DevKit vision",
    "multi-agent coding",
    "repeatable engineering workflow",
    "development best practices",
    "AI coding philosophy",
    "software development methodology",
    "code quality",
    "team collaboration",
  ],
  openGraph: {
    title: "Vision - AI DevKit",
    description:
      "Discover the vision behind AI DevKit: one control plane for AI coding agents.",
    url: `${siteUrl}/vision`,
    siteName: "AI DevKit",
    locale: "en_US",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vision - AI DevKit",
    description:
      "Discover the vision behind AI DevKit: one control plane for AI coding agents.",
  },
  alternates: {
    canonical: `${siteUrl}/vision`,
  },
};

export default function VisionPage() {
  const page = getPage("vision");

  if (!page) {
    notFound();
  }

  return (
    <div className="bg-canvas py-16">
      <article className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <MarkdownContent content={page.content} />
      </article>
      <div className="mt-16 pt-8 border-t border-rule mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="bg-tint p-8 rounded-lg border border-rule">
          <h2 className="text-2xl font-bold mb-4 text-fg-strong">Ready to get started?</h2>
          <p className="text-fg-muted mb-6">
            See how AI DevKit adds shared setup, a local console, memory,
            communication, workflow skills, and verification to the AI coding
            tools you already use.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/docs"
              className="px-6 py-3 bg-fg-strong text-canvas rounded-lg font-medium hover:bg-fg transition-colors no-underline text-center"
            >
              Get Started
            </Link>
            <a
              href="/roadmap"
              className="px-6 py-3 border border-fg-strong text-fg-strong rounded-lg font-medium hover:bg-tint transition-colors no-underline text-center"
            >
              View Roadmap
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
