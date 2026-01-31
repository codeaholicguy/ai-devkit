import Link from "next/link";
import { setupToolEntries } from "@/lib/seo/setup-tools";

export default function GettingStartedGuides() {
  return (
    <section className="mt-12 border-t border-gray-200 pt-8">
      <h2 className="text-2xl font-bold mb-4">
        Getting Started Guides by Tool
      </h2>
      <p className="text-gray-600 mb-6">
        Choose your AI tool for a tailored setup guide.
      </p>
      <ul className="list-disc pl-5 space-y-2">
        {setupToolEntries.map((entry) => (
          <li key={entry.slug}>
            <Link
              href={`/faq/getting-started/${entry.slug}`}
              className="hover:opacity-70 transition-opacity"
            >
              {`Setting up AI DevKit for ${entry.tool}`}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
