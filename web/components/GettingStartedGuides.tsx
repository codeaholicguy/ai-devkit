import Link from "next/link";
import { setupToolEntries } from "@/lib/seo/setup-tools";

interface GettingStartedGuidesProps {
  /** Tool slug to leave out, when shown on that tool's own guide. */
  excludeSlug?: string;
}

export default function GettingStartedGuides({ excludeSlug }: GettingStartedGuidesProps) {
  const entries = setupToolEntries.filter((entry) => entry.slug !== excludeSlug);

  return (
    <section className="setup-guides" aria-labelledby="setup-guides-title" data-pagefind-ignore>
      <h2 id="setup-guides-title">Setup guide by tool</h2>
      <p>Pick your agent for step-by-step setup.</p>
      <ul>
        {entries.map((entry) => (
          <li key={entry.slug}>
            <Link href={`/faq/getting-started/${entry.slug}`}>
              <span className="sr-only">Setting up AI DevKit for </span>
              {entry.tool}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
