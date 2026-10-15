import GithubSlugger from 'github-slugger';
import type { Page } from '../content/types';
import { DOC_SECTIONS, type DocSection } from './sections';

export interface DocNavPage {
  slug: string;
  title: string;
  description: string;
}

export interface DocNavGroup {
  section: DocSection;
  pages: DocNavPage[];
}

export interface DocHeading {
  id: string;
  text: string;
  depth: 2 | 3;
}

/**
 * Group sorted doc pages by section, in sidebar order.
 */
export function getDocsNav(docs: Page[]): DocNavGroup[] {
  return DOC_SECTIONS.map((section) => ({
    section,
    pages: docs
      .filter((doc) => doc.metadata.section === section.id)
      .map((doc) => ({
        slug: doc.metadata.slug,
        title: doc.metadata.title,
        description: doc.metadata.description,
      })),
  })).filter((group) => group.pages.length > 0);
}

/**
 * Plain text of a Markdown heading, matching what rehype-slug sees.
 */
function headingText(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .trim();
}

/**
 * Extract h2/h3 headings for the "On this page" outline.
 * Every heading level feeds the slugger so duplicate ids match rehype-slug.
 */
export function extractHeadings(content: string): DocHeading[] {
  const slugger = new GithubSlugger();
  const headings: DocHeading[] = [];
  let fence: string | null = null;

  for (const line of content.split('\n')) {
    const fenceMatch = line.match(/^\s*(```|~~~)/);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1];
      else if (fenceMatch[1] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;

    const text = headingText(match[2]);
    const id = slugger.slug(text);
    const depth = match[1].length;
    if (depth === 2 || depth === 3) {
      headings.push({ id, text, depth });
    }
  }

  return headings;
}
