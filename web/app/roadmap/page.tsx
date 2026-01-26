import { getRoadmap } from '@/lib/content/loader';
import MarkdownContent from '@/components/MarkdownContent';
import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ai-devkit.com';

export const metadata: Metadata = {
  title: 'Roadmap',
  description:
    "The development roadmap for AI DevKit - see what we're building, current progress, and upcoming features for AI-assisted development.",
  keywords: [
    'AI DevKit roadmap',
    'AI DevKit features',
    'development roadmap',
    'upcoming features',
    'AI coding tools',
    'product roadmap',
    'AI DevKit plans',
    'feature requests',
  ],
  openGraph: {
    title: 'Roadmap - AI DevKit',
    description:
      "See what we're building and where we're headed with AI DevKit - our development roadmap and upcoming features.",
    url: `${siteUrl}/roadmap`,
    siteName: 'AI DevKit',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Roadmap - AI DevKit',
    description:
      "See what we're building and where we're headed with AI DevKit - our development roadmap and upcoming features.",
  },
  alternates: {
    canonical: `${siteUrl}/roadmap`,
  },
};

const statusColors = {
  'planned': 'bg-gray-100 text-gray-800 border-gray-300',
  'in-progress': 'bg-blue-50 text-blue-800 border-blue-300',
  'completed': 'bg-green-50 text-green-800 border-green-300',
  'on-hold': 'bg-yellow-50 text-yellow-800 border-yellow-300',
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
    <div className="bg-white py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Roadmap</h1>

        <p className="text-xl text-gray-600 mb-12">
          Our development roadmap shows what we're working on and what's coming next for AI DevKit.
        </p>

        {roadmapItems.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-8">
            <p className="text-gray-600">
              Roadmap items will be added soon. Check back later or follow us on GitHub for updates.
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {groupedItems['in-progress'].length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
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
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <span className="w-3 h-3 bg-gray-400 rounded-full"></span>
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
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <span className="w-3 h-3 bg-green-500 rounded-full"></span>
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

        <div className="mt-16 pt-8 border-t border-gray-200">
          <div className="bg-gray-50 p-8 rounded-lg border border-gray-200">
            <h2 className="text-2xl font-bold mb-4">Have ideas?</h2>
            <p className="text-gray-600 mb-6">
              We'd love to hear your suggestions for AI DevKit. Open an issue or discussion on GitHub to share your thoughts.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href="https://github.com/codeaholicguy/ai-devkit/issues/new"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors no-underline text-center"
              >
                Submit an Idea
              </a>
              <a
                href="https://github.com/codeaholicguy/ai-devkit/discussions"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 border border-black rounded-lg font-medium hover:bg-gray-50 transition-colors no-underline text-center"
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

function RoadmapItem({ item }: { item: { metadata: any; content: string } }) {
  const statusColor = statusColors[item.metadata.status as keyof typeof statusColors] || statusColors.planned;
  const statusLabel = statusLabels[item.metadata.status as keyof typeof statusLabels] || 'Unknown';

  return (
    <div className="border border-gray-200 rounded-lg p-6 hover:border-gray-400 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
        <h3 className="text-xl font-bold">{item.metadata.title}</h3>
        <div className="flex gap-2 flex-wrap">
          <span className={`px-3 py-1 rounded-full text-sm font-medium border ${statusColor}`}>
            {statusLabel}
          </span>
          {item.metadata.timeframe && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300">
              {item.metadata.timeframe}
            </span>
          )}
        </div>
      </div>
      <div className="text-gray-700 leading-relaxed">
        {item.content}
      </div>
    </div>
  );
}