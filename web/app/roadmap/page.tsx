import { getRoadmap } from '@/lib/content/loader';
import type { RoadmapItem as RoadmapItemType } from '@/lib/content/types';

import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ai-devkit.com';

export const metadata: Metadata = {
  title: 'Roadmap',
  description:
    "The AI DevKit roadmap for building a control plane across AI coding agents, memory, communication, workflows, and verification.",
  keywords: [
    'AI DevKit roadmap',
    'AI DevKit features',
    'AI agent control plane roadmap',
    'upcoming features',
    'AI coding tools',
    'product roadmap',
    'AI DevKit plans',
    'feature requests',
  ],
  openGraph: {
    title: 'Roadmap - AI DevKit',
    description:
      "See what we're building next for AI DevKit: agent setup, console, memory, communication, workflow skills, and verification.",
    url: `${siteUrl}/roadmap`,
    siteName: 'AI DevKit',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Roadmap - AI DevKit',
    description:
      "See what we're building next for AI DevKit: agent setup, console, memory, communication, workflow skills, and verification.",
  },
  alternates: {
    canonical: `${siteUrl}/roadmap`,
  },
};

const statusColors = {
  'planned': 'bg-tint text-fg border-rule',
  'in-progress': 'bg-tint text-secondary border-secondary',
  'completed': 'bg-tint text-signal border-signal',
  'on-hold': 'bg-tint text-caution border-caution',
};

const statusLabels = {
  'planned': 'Planned',
  'in-progress': 'In Progress',
  'completed': 'Completed',
  'on-hold': 'On Hold',
};

export default function RoadmapPage() {
  const roadmapItems = getRoadmap();

  const groupedItems = {
    'in-progress': roadmapItems.filter(item => item.metadata.status === 'in-progress'),
    'planned': roadmapItems.filter(item => item.metadata.status === 'planned'),
    'completed': roadmapItems.filter(item => item.metadata.status === 'completed'),
    'on-hold': roadmapItems.filter(item => item.metadata.status === 'on-hold'),
  };

  return (
    <div className="bg-canvas py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 text-fg-strong">Roadmap</h1>

        <p className="text-xl text-fg-muted mb-12">
          {`Our roadmap shows what's next for turning scattered AI coding agents into one local system: setup, console, memory, communication, workflow skills, and verification.`}
        </p>

        {roadmapItems.length === 0 ? (
          <div className="bg-tint border border-rule rounded-lg p-8">
            <p className="text-fg-muted">
              Roadmap items will be added soon. Check back later or follow us on GitHub for updates.
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {groupedItems['in-progress'].length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3 text-fg-strong">
                  <span className="w-3 h-3 bg-secondary rounded-full"></span>
                  In Progress
                </h2>
                <div className="space-y-6">
                  {groupedItems['in-progress'].map((item, index) => (
                    <RoadmapItem key={index} item={item} />
                  ))}
                </div>
              </section>
            )}

            {groupedItems['planned'].length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3 text-fg-strong">
                  <span className="w-3 h-3 bg-outline rounded-full"></span>
                  Planned
                </h2>
                <div className="space-y-6">
                  {groupedItems['planned'].map((item, index) => (
                    <RoadmapItem key={index} item={item} />
                  ))}
                </div>
              </section>
            )}

            {groupedItems['completed'].length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3 text-fg-strong">
                  <span className="w-3 h-3 bg-signal rounded-full"></span>
                  Completed
                </h2>
                <div className="space-y-6">
                  {groupedItems['completed'].map((item, index) => (
                    <RoadmapItem key={index} item={item} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <div className="mt-16 pt-8 border-t border-rule">
          <div className="bg-tint p-8 rounded-lg border border-rule">
            <h2 className="text-2xl font-bold mb-4 text-fg-strong">Have ideas?</h2>
            <p className="text-fg-muted mb-6">
              {`We'd love to hear your suggestions for AI DevKit. Open an issue or discussion on GitHub to share your thoughts.`}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href="https://github.com/codeaholicguy/ai-devkit/issues/new"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-fg-strong text-canvas rounded-lg font-medium hover:bg-fg transition-colors no-underline text-center"
              >
                Submit an Idea
              </a>
              <a
                href="https://github.com/codeaholicguy/ai-devkit/discussions"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 border border-fg-strong text-fg-strong rounded-lg font-medium hover:bg-tint transition-colors no-underline text-center"
              >
                Join Discussion
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoadmapItem({ item }: { item: RoadmapItemType }) {
  const statusColor = statusColors[item.metadata.status] || statusColors.planned;
  const statusLabel = statusLabels[item.metadata.status] || 'Unknown';

  return (
    <div className="border border-rule rounded-lg p-6 hover:border-outline transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
        <h3 className="text-xl font-bold text-fg-strong">{item.metadata.title}</h3>
        <div className="flex gap-2 flex-wrap">
          <span className={`px-3 py-1 rounded-full text-sm font-medium border ${statusColor}`}>
            {statusLabel}
          </span>
          {item.metadata.timeframe && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-tint text-fg border border-rule">
              {item.metadata.timeframe}
            </span>
          )}
        </div>
      </div>
      <div className="text-fg leading-relaxed">
        {item.content}
      </div>
    </div>
  );
}
