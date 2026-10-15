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
    <section className="faq-related" aria-labelledby="more-faq-topics" data-pagefind-ignore>
      <h2 id="more-faq-topics">More FAQ Topics</h2>
      <p>Explore related AI DevKit questions and topics.</p>
      <ul>
        {related.map((entry) => (
          <li key={entry.slug}>
            <Link href={`/faq/${entry.slug}`}>{entry.keyword}</Link>
          </li>
        ))}
      </ul>
      <p className="faq-related-all">
        <Link href="/faq">Browse all FAQ topics</Link>
      </p>
    </section>
  );
}
