import Link from "next/link";
import { seoKeywordEntries } from "@/lib/seo/keywords";

export default function FaqKeywordLinks() {
  return (
    <section className="mt-12 border-t border-gray-200 pt-8">
      <h2 className="text-2xl font-bold mb-4">More FAQ Topics</h2>
      <p className="text-gray-600 mb-6">
        Explore related AI DevKit questions and topics.
      </p>
      <ul className="list-disc pl-5 space-y-2">
        {seoKeywordEntries.map((entry) => (
          <li key={entry.slug}>
            <Link
              href={`/faq/${entry.slug}`}
              className="hover:opacity-70 transition-opacity"
            >
              {entry.keyword}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
