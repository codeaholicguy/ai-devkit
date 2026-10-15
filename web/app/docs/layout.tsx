import SearchProvider from '@/components/docs/SearchProvider';
import { DOC_SECTIONS } from '@/lib/docs/sections';

const QUICK_LINKS = [
  { title: 'Getting Started', href: '/docs/1-getting-started' },
  { title: 'Skills', href: '/docs/7-skills' },
  { title: 'Configuration File', href: '/docs/11-configuration-file' },
  { title: 'Agent Console', href: '/docs/13-agent-console' },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-docs">
      <SearchProvider
        quickLinks={QUICK_LINKS}
        sections={DOC_SECTIONS.map(({ id, title }) => ({ id, title }))}
      >
        {children}
      </SearchProvider>
    </div>
  );
}
