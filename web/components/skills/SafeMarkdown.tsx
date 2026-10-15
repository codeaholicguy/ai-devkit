'use client';

import { useMemo, type ComponentPropsWithoutRef } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import type { Root, Element } from 'hast';
import CodeBlock from '@/components/docs/CodeBlock';

// Third-party Markdown: remark-rehype drops raw HTML (no allowDangerousHtml),
// and every link and image URL is resolved and limited to these schemes.
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function safeUrl(url: unknown, base: string): string | undefined {
  if (typeof url !== 'string' || url === '') return undefined;
  if (url.startsWith('#')) return url;
  try {
    const resolved = new URL(url, base);
    return SAFE_PROTOCOLS.has(resolved.protocol) ? resolved.href : undefined;
  } catch {
    return undefined;
  }
}

/** Drop the file's own h1 (the page already has one). */
function dropFirstH1(tree: Root) {
  const index = tree.children.findIndex(
    (node) => node.type === 'element' && (node as Element).tagName === 'h1',
  );
  if (index !== -1) tree.children.splice(index, 1);
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeHighlight)
  .use(rehypeSlug);

interface SafeMarkdownProps {
  markdown: string;
  /** Base for relative links (the file's folder on github.com). */
  linkBase: string;
  /** Base for relative images (the file's folder on raw.githubusercontent.com). */
  imageBase: string;
}

export default function SafeMarkdown({ markdown, linkBase, imageBase }: SafeMarkdownProps) {
  const content = useMemo(() => {
    const source = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    const tree = processor.runSync(processor.parse(source)) as Root;
    dropFirstH1(tree);

    return toJsxRuntime(tree, {
      Fragment,
      jsx,
      jsxs,
      components: {
        // One level down: the page's own h2 introduces the file.
        h1: (props: ComponentPropsWithoutRef<'h3'>) => <h3 {...props} />,
        h2: (props: ComponentPropsWithoutRef<'h3'>) => <h3 {...props} />,
        h3: (props: ComponentPropsWithoutRef<'h4'>) => <h4 {...props} />,
        h4: (props: ComponentPropsWithoutRef<'h5'>) => <h5 {...props} />,
        a: ({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) => {
          const url = safeUrl(href, linkBase);
          if (!url) return <span>{children}</span>;
          const external = !url.startsWith('#');
          return (
            <a
              {...props}
              href={url}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow ugc' } : {})}
            >
              {children}
            </a>
          );
        },
        img: ({ src, alt }: ComponentPropsWithoutRef<'img'>) => {
          const url = safeUrl(src, imageBase);
          if (!url || url.startsWith('mailto:')) return alt ? <span>{alt}</span> : null;
          // eslint-disable-next-line @next/next/no-img-element -- remote third-party image, size unknown
          return <img src={url} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" />;
        },
        pre: ({ children, ...props }: ComponentPropsWithoutRef<'pre'>) => {
          const child = Array.isArray(children) ? children[0] : children;
          const className =
            child && typeof child === 'object' && 'props' in child
              ? (child.props as { className?: string }).className
              : undefined;
          const language = className?.match(/language-([\w-]+)/)?.[1];
          return (
            <CodeBlock language={language}>
              <pre {...props}>{children}</pre>
            </CodeBlock>
          );
        },
        table: (props: ComponentPropsWithoutRef<'table'>) => (
          <div className="table-scroll">
            <table {...props} />
          </div>
        ),
      },
    });
  }, [markdown, linkBase, imageBase]);

  return <div className="doc-prose">{content}</div>;
}
