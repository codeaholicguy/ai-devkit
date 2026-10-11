import Link from "next/link";
import { resolveSeoCluster, seoKeywordEntries } from "@/lib/seo/keywords";

const MAX_LINKS = 10;

interface FaqKeywordLinksProps {
  currentSlug?: string;
}

export default function FaqKeywordLinks({ currentSlug }: FaqKeywordLinksProps) {
  const currentCluster = currentSlug ? resolveSeoCluster(currentSlug) : null;
  const candidates = seoKeywordEntries.filter(
    (entry) => entry.slug !== currentSlug
  );
  const related = [
    ...candidates.filter((entry) => entry.cluster === currentCluster),
    ...candidates.filter((entry) => entry.cluster !== currentCluster),
  ].slice(0, MAX_LINKS);

  return (
    <section className="mt-12 border-t border-gray-200 pt-8">
      <h2 className="text-2xl font-bold mb-4">More FAQ Topics</h2>
      <p className="text-gray-600 mb-6">
        Explore related AI DevKit questions and topics.
      </p>
      <ul className="list-disc pl-5 space-y-2">
        {related.map((entry) => (
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
      <p className="mt-6">
        <Link
          href="/faq"
          className="font-semibold text-[#2a3e9a] no-underline hover:text-[#0c2483]"
        >
          Browse all FAQ topics
        </Link>
      </p>
    </section>
  );
}
