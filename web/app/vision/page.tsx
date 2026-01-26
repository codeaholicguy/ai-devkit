import { getPage } from "@/lib/content/loader";
import MarkdownContent from "@/components/MarkdownContent";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-devkit.com";

export const metadata: Metadata = {
  title: "Vision",
  description:
    "The vision and purpose behind AI DevKit - bridging AI-assisted development with structured software engineering practices for better code quality and team collaboration.",
  keywords: [
    "AI DevKit vision",
    "AI-assisted development",
    "structured software engineering",
    "development best practices",
    "AI coding philosophy",
    "software development methodology",
    "code quality",
    "team collaboration",
  ],
  openGraph: {
    title: "Vision - AI DevKit",
    description:
      "Discover the vision behind AI DevKit - bridging AI-assisted development with structured software engineering practices.",
    url: `${siteUrl}/vision`,
    siteName: "AI DevKit",
    locale: "en_US",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vision - AI DevKit",
    description:
      "Discover the vision behind AI DevKit - bridging AI-assisted development with structured software engineering practices.",
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
    <div className="bg-white py-16">
      <article className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <MarkdownContent content={page.content} />
      </article>
      <div className="mt-16 pt-8 border-t border-gray-200 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="bg-gray-50 p-8 rounded-lg border border-gray-200">
          <h2 className="text-2xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-gray-600 mb-6">
            See how AI DevKit can improve your development workflow with
            structured practices and AI assistance.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="/docs"
              className="px-6 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors no-underline text-center"
            >
              Get Started
            </a>
            <a
              href="/roadmap"
              className="px-6 py-3 border border-black rounded-lg font-medium hover:bg-gray-50 transition-colors no-underline text-center"
            >
              View Roadmap
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
