'use client';

import { useGitHubStars } from '@/lib/GitHubContext';
import { REPO_URL } from '@/lib/utils';
import GitHubIcon from './GitHubIcon';
import GitHubStars from './GitHubStars';

export default function GitHubButton() {
  const { stars } = useGitHubStars();

  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-outline px-5 font-medium text-on-surface no-underline transition-[background-color,transform] hover:bg-surface-container active:scale-[0.98]"
    >
      <GitHubIcon className="h-5 w-5" />
      <span>View on GitHub</span>
      <span className="sr-only">(opens in a new tab)</span>
      {stars !== null && (
        <span className="rounded-full bg-surface-container px-2 py-0.5 text-on-surface-variant">
          <GitHubStars />
        </span>
      )}
    </a>
  );
}
