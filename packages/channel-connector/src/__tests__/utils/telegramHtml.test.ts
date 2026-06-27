import { markdownToTelegramHtml } from '../../utils/telegramHtml.js';

describe('markdownToTelegramHtml', () => {
    it('renders bold, italic, strikethrough', () => {
        const out = markdownToTelegramHtml('**b** _i_ ~~s~~');
        expect(out).toContain('<b>b</b>');
        expect(out).toContain('<i>i</i>');
        expect(out).toContain('<s>s</s>');
    });

    it('renders inline code and fenced code with language', () => {
        const md = 'Run `npm test`\n\n```ts\nconst x = 1;\n```';
        const out = markdownToTelegramHtml(md);
        expect(out).toContain('<code>npm test</code>');
        expect(out).toContain('<pre><code class="language-ts">const x = 1;</code></pre>');
    });

    it('renders links and converts headings to bold', () => {
        const md = '# Title\n\nSee [docs](https://x.com).';
        const out = markdownToTelegramHtml(md);
        expect(out).toContain('<b>Title</b>');
        expect(out).toContain('<a href="https://x.com">docs</a>');
    });

    it('renders images as alt-text links', () => {
        const out = markdownToTelegramHtml('![diagram](https://x.com/d.png)');
        expect(out).toBe('<a href="https://x.com/d.png">diagram</a>');
    });

    it('falls back to URL when image has no alt text', () => {
        const out = markdownToTelegramHtml('![](https://x.com/d.png)');
        expect(out).toContain('<a href="https://x.com/d.png">https://x.com/d.png</a>');
    });

    it('renders unordered lists with bullets', () => {
        const out = markdownToTelegramHtml('- one\n- two\n- three');
        expect(out).toContain('• one');
        expect(out).toContain('• two');
        expect(out).toContain('• three');
        expect(out).not.toContain('<ul>');
    });

    it('renders nested lists without throwing', () => {
        const out = markdownToTelegramHtml('- agent\n  - Status');

        expect(out).toContain('• agent');
        expect(out).toContain('• Status');
        expect(out).not.toContain('<ul>');
    });

    it('renders ordered lists with numbers', () => {
        const out = markdownToTelegramHtml('1. one\n2. two');
        expect(out).toContain('1. one');
        expect(out).toContain('2. two');
        expect(out).not.toContain('<ol>');
    });

    it('renders tables as ASCII inside <pre>', () => {
        const md = '| a | b |\n|---|---|\n| 1 | 2 |';
        const out = markdownToTelegramHtml(md);
        expect(out.startsWith('<pre>')).toBe(true);
        expect(out).toContain('a');
        expect(out).toContain('b');
        expect(out).toContain('1');
        expect(out).toContain('2');
        expect(out).not.toContain('<table>');
    });

    it('uses <blockquote> for quotes', () => {
        const out = markdownToTelegramHtml('> quoted');
        expect(out).toContain('<blockquote>');
        expect(out).toContain('quoted');
        expect(out).toContain('</blockquote>');
    });

    it('escapes HTML special chars in plain text', () => {
        const out = markdownToTelegramHtml('a < b && c > d');
        expect(out).toContain('&lt;');
        expect(out).toContain('&amp;');
        expect(out).toContain('&gt;');
        expect(out).not.toContain(' < ');
    });

    it('escapes HTML special chars inside code', () => {
        const out = markdownToTelegramHtml('`<script>`');
        expect(out).toContain('<code>&lt;script&gt;</code>');
    });

    it('strips raw HTML blocks', () => {
        const out = markdownToTelegramHtml('hello\n\n<div>raw</div>\n\nworld');
        expect(out).not.toContain('<div>');
        expect(out).toContain('hello');
        expect(out).toContain('world');
    });

    it('renders horizontal rule as a divider', () => {
        const out = markdownToTelegramHtml('above\n\n---\n\nbelow');
        expect(out).toContain('above');
        expect(out).toContain('———');
        expect(out).toContain('below');
    });

    it('passes plain text through unchanged', () => {
        expect(markdownToTelegramHtml('hello world')).toBe('hello world');
    });
});
