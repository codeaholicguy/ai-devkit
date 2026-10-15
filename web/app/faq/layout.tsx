import SearchProvider from '@/components/docs/SearchProvider';
import { DOC_SECTIONS } from '@/lib/docs/sections';

const QUICK_LINKS = [
  { title: 'Getting Started', href: '/docs/1-getting-started' },
  { title: 'AI DevKit vs Spec Kit', href: '/faq/ai-devkit-vs-spec-kit' },
  { title: 'Persistent Memory for Claude Code', href: '/faq/claude-code-persistent-memory' },
  { title: 'AGENTS.md Best Practices', href: '/faq/agents-md-best-practices' },
];

// FAQ pages share the docs reading surface, theme, and ⌘K search.
export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-docs page-faq">
      <SearchProvider
        quickLinks={QUICK_LINKS}
        sections={DOC_SECTIONS.map(({ id, title }) => ({ id, title }))}
      >
        {children}
      </SearchProvider>
    </div>
  );
}
