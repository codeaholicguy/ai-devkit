import Link from 'next/link';
import { getAllDocPages } from '@/lib/content/loader';

export default function DocsPage() {
  const docs = getAllDocPages();

  return (
    <div className="bg-white py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-8">Documentation</h1>
        
        <p className="text-xl text-gray-600 mb-12">
          Everything you need to know about using AI DevKit for AI-assisted structured software development.
        </p>

        {docs.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-8">
            <p className="text-gray-600">
              No documentation pages found. Documentation will be added soon.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {docs.map((doc) => (
              <Link
                key={doc.metadata.slug}
                href={`/docs/${doc.metadata.slug}`}
                className="block p-6 border border-gray-200 rounded-lg hover:border-black transition-colors no-underline group"
              >
                <h2 className="text-2xl font-bold mb-2 group-hover:opacity-70 transition-opacity">
                  {doc.metadata.title}
                </h2>
                <p className="text-gray-600">
                  {doc.metadata.description}
                </p>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-12 pt-12 border-t border-gray-200">
          <h2 className="text-2xl font-bold mb-4">Need Help?</h2>
          <p className="text-gray-600 mb-4">
            Can't find what you're looking for? Check out our GitHub repository or open an issue.
          </p>
          <div className="flex gap-4">
            <a
              href="https://github.com/codeaholicguy/ai-devkit"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-2 border border-black rounded-lg font-medium hover:bg-gray-50 transition-colors no-underline"
            >
              GitHub Repository
            </a>
            <a
              href="https://github.com/codeaholicguy/ai-devkit/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-2 border border-black rounded-lg font-medium hover:bg-gray-50 transition-colors no-underline"
            >
              Report an Issue
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

