import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

interface MarkdownContentProps {
  content: string;
}

type HeadingLevel = 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

function createLinkableHeading(level: HeadingLevel) {
  return function LinkableHeading({
    children,
    id,
    ...props
  }: ComponentPropsWithoutRef<HeadingLevel> & { children?: ReactNode }) {
    return (
      <div className="group relative">
        {id && (
          <a
            href={`#${id}`}
            aria-label={`Copy link to this section: ${id}`}
            title="Copy section link"
            className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus:opacity-100 no-underline transition-opacity text-gray-500 hover:text-black"
          >
            #
          </a>
        )}
        {level === 'h2' && <h2 id={id} {...props}>{children}</h2>}
        {level === 'h3' && <h3 id={id} {...props}>{children}</h3>}
        {level === 'h4' && <h4 id={id} {...props}>{children}</h4>}
        {level === 'h5' && <h5 id={id} {...props}>{children}</h5>}
        {level === 'h6' && <h6 id={id} {...props}>{children}</h6>}
      </div>
    );
  };
}

export default async function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="prose prose-lg max-w-none
      prose-headings:font-bold 
      prose-h1:text-4xl prose-h1:mb-6
      prose-h2:text-3xl prose-h2:mt-12 prose-h2:mb-4
      prose-h3:text-2xl prose-h3:mt-8 prose-h3:mb-3
      prose-p:text-gray-700 prose-p:leading-relaxed
      prose-a:text-black prose-a:underline hover:prose-a:opacity-70
      prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
      prose-pre:bg-gray-900 prose-pre:text-gray-100
      prose-ul:my-6 prose-li:my-2
      prose-strong:font-bold prose-strong:text-black">
      <MDXRemote
        source={content}
        components={{
          h2: createLinkableHeading('h2'),
          h3: createLinkableHeading('h3'),
          h4: createLinkableHeading('h4'),
          h5: createLinkableHeading('h5'),
          h6: createLinkableHeading('h6'),
        }}
        options={{
          mdxOptions: {
            remarkPlugins: [remarkGfm],
            rehypePlugins: [rehypeHighlight, rehypeSlug],
          },
        }}
      />
    </div>
  );
}
