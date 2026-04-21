import Link from 'next/link';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 mt-auto" role="contentinfo" aria-label="Site footer">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-sm font-bold mb-3">AI DevKit</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              A CLI toolkit for AI-assisted software development with phase templates and structured workflows.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold mb-3">Resources</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/docs" className="text-gray-600 hover:text-black no-underline">
                  Documentation
                </Link>
              </li>
              <li>
                <a href="/vision" className="text-gray-600 hover:text-black no-underline">
                  Vision
                </a>
              </li>
              <li>
                <a href="/roadmap" className="text-gray-600 hover:text-black no-underline">
                  Roadmap
                </a>
              </li>
              <li>
                <a 
                  href="https://github.com/codeaholicguy/ai-devkit" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-black no-underline"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold mb-3">Community</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a 
                  href="https://github.com/codeaholicguy/ai-devkit/issues" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-black no-underline"
                >
                  Issues
                </a>
              </li>
              <li>
                <a 
                  href="https://github.com/codeaholicguy/ai-devkit/blob/main/CHANGELOG.md" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-black no-underline"
                >
                  Changelog
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500 text-center">
            © {currentYear} AI DevKit. Released under the MIT License.
          </p>
        </div>
      </div>
    </footer>
  );
}
