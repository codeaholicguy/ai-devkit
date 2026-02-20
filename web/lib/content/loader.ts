import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { Page, PageMetadata, RoadmapItem, RoadmapItemMetadata } from './types';

const contentDirectory = path.join(process.cwd(), 'content');
const docsDirectory = path.join(contentDirectory, 'docs');
const pagesDirectory = path.join(contentDirectory, 'pages');
const faqDirectory = path.join(contentDirectory, 'faq');

/**
 * Get all Markdown files from a directory
 */
function getMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  
  const files = fs.readdirSync(dir);
  return files
    .filter(file => file.endsWith('.md') || file.endsWith('.mdx'))
    .map(file => path.join(dir, file));
}

/**
 * Parse a Markdown file with frontmatter
 */
function parseMarkdownFile<T>(filePath: string): { metadata: T; content: string } {
  const fileContents = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(fileContents);
  
  return {
    metadata: data as T,
    content: content.trim(),
  };
}

/**
 * Get a single page by slug
 */
export function getPage(slug: string): Page | null {
  const filePath = path.join(pagesDirectory, `${slug}.md`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  const parsed = parseMarkdownFile<PageMetadata>(filePath);
  
  return {
    metadata: {
      ...parsed.metadata,
      slug,
    },
    content: parsed.content,
  };
}

/**
 * Get all pages
 */
export function getAllPages(): Page[] {
  const files = getMarkdownFiles(pagesDirectory);
  
  const pages = files.map(filePath => {
    const slug = path.basename(filePath, path.extname(filePath));
    const parsed = parseMarkdownFile<PageMetadata>(filePath);
    
    return {
      metadata: {
        ...parsed.metadata,
        slug,
      },
      content: parsed.content,
    };
  });
  
  // Sort by order if specified
  return pages.sort((a, b) => {
    const orderA = a.metadata.order ?? 999;
    const orderB = b.metadata.order ?? 999;
    return orderA - orderB;
  });
}

/**
 * Get a single documentation page by slug
 */
export function getDocPage(slug: string): Page | null {
  const filePath = path.join(docsDirectory, `${slug}.md`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  const parsed = parseMarkdownFile<PageMetadata>(filePath);
  
  return {
    metadata: {
      ...parsed.metadata,
      slug,
    },
    content: parsed.content,
  };
}

/**
 * Get all documentation pages
 */
export function getAllDocPages(): Page[] {
  const files = getMarkdownFiles(docsDirectory);
  
  const pages = files.map(filePath => {
    const slug = path.basename(filePath, path.extname(filePath));
    const parsed = parseMarkdownFile<PageMetadata>(filePath);
    
    return {
      metadata: {
        ...parsed.metadata,
        slug,
      },
      content: parsed.content,
    };
  });
  
  // Sort by order if specified
  return pages.sort((a, b) => {
    const orderA = a.metadata.order ?? 999;
    const orderB = b.metadata.order ?? 999;
    return orderA - orderB;
  });
}

/**
 * Get a single FAQ page by slug
 */
export function getFaqPage(slug: string): Page | null {
  const filePath = path.join(faqDirectory, `${slug}.md`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const parsed = parseMarkdownFile<PageMetadata>(filePath);

  return {
    metadata: {
      ...parsed.metadata,
      slug,
    },
    content: parsed.content,
  };
}

/**
 * Get all FAQ pages
 */
export function getAllFaqPages(): Page[] {
  const files = getMarkdownFiles(faqDirectory);

  const pages = files.map(filePath => {
    const slug = path.basename(filePath, path.extname(filePath));
    const parsed = parseMarkdownFile<PageMetadata>(filePath);

    return {
      metadata: {
        ...parsed.metadata,
        slug,
      },
      content: parsed.content,
    };
  });

  return pages.sort((a, b) => {
    const orderA = a.metadata.order ?? 999;
    const orderB = b.metadata.order ?? 999;
    return orderA - orderB;
  });
}

/**
 * Get all roadmap items
 */
export function getRoadmap(): RoadmapItem[] {
  const roadmapDir = path.join(contentDirectory, 'roadmap');
  const files = getMarkdownFiles(roadmapDir);
  
  const items = files.map(filePath => {
    const parsed = parseMarkdownFile<RoadmapItemMetadata>(filePath);
    return parsed as RoadmapItem;
  });
  
  // Sort by order if specified, then by priority
  return items.sort((a, b) => {
    const orderA = a.metadata.order ?? 999;
    const orderB = b.metadata.order ?? 999;
    return orderA - orderB;
  });
}
