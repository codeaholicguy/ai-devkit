import Link from 'next/link';
import CodeBlock from '@/components/docs/CodeBlock';

/** The one next step at the end of every FAQ page. */
export default function TryIt() {
  return (
    <section className="faq-try" aria-labelledby="try-ai-devkit" data-pagefind-ignore>
      <div>
        <h2 id="try-ai-devkit">Try AI DevKit</h2>
        <p>Connect your agents once, then init in each project. No global install needed.</p>
        <Link href="/docs/1-getting-started" className="docs-button">
          Get started →
        </Link>
      </div>
      <CodeBlock language="bash">
        <pre>
          <code>{`npx ai-devkit@latest setup\ncd your-project\nnpx ai-devkit@latest init`}</code>
        </pre>
      </CodeBlock>
    </section>
  );
}
