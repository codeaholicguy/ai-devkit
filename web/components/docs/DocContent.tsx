import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import { isValidElement, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import rehypeCommandCards from '@/lib/docs/rehype-command-cards';
import CodeBlock from './CodeBlock';

type HeadingLevel = 'h2' | 'h3' | 'h4';

function createHeading(Tag: HeadingLevel) {
  return function DocHeading({
    children,
    id,
    ...props
  }: ComponentPropsWithoutRef<HeadingLevel> & { children?: ReactNode }) {
    return (
      <Tag id={id} {...props}>
        {children}
        {id && (
          <a href={`#${id}`} className="heading-anchor" aria-label="Link to this section" data-pagefind-ignore>
            #
          </a>
        )}
      </Tag>
    );
  };
}

function Pre({ children, ...props }: ComponentPropsWithoutRef<'pre'>) {
  let language: string | undefined;
  if (isValidElement<{ className?: string }>(children)) {
    language = children.props.className?.match(/language-([\w-]+)/)?.[1];
  }
  return (
    <CodeBlock language={language}>
      <pre {...props}>{children}</pre>
    </CodeBlock>
  );
}

function Table(props: ComponentPropsWithoutRef<'table'>) {
  return (
    <div className="table-scroll">
      <table {...props} />
    </div>
  );
}

interface DocContentProps {
  content: string;
  /** 'md' for plain Markdown that must not be parsed as JSX (e.g. SKILL.md). */
  format?: 'mdx' | 'md';
}

export default async function DocContent({ content, format = 'mdx' }: DocContentProps) {
  return (
    <div className="doc-prose">
      <MDXRemote
        source={content}
        components={{
          h2: createHeading('h2'),
          h3: createHeading('h3'),
          h4: createHeading('h4'),
          pre: Pre,
          table: Table,
        }}
        options={{
          mdxOptions: {
            format,
            remarkPlugins: [remarkGfm],
            rehypePlugins: [rehypeHighlight, rehypeSlug, rehypeCommandCards],
          },
        }}
      />
    </div>
  );
}
