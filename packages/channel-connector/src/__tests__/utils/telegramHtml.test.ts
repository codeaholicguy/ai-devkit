import { markdownToTelegramHtml } from '../../utils/telegramHtml.js';

describe('markdownToTelegramHtml', () => {
    it('renders bold, italic, strikethrough', () => {
        const out = markdownToTelegramHtml('**b** _i_ ~~s~~');
        expect(out).toContain('<b>b</b>');
        expect(out).toContain('<i>i</i>');
        expect(out).toContain('<s>s</s>');
    });

    it('renders inline code and fenced code with language', () => {
        const md = 'Run `npm test`\n\n```ts\nconst x = 1;\n```\n\n```\nplain\n```';
        const out = markdownToTelegramHtml(md);
        expect(out).toContain('<code>npm test</code>');
        expect(out).toContain('<pre><code class="language-ts">const x = 1;</code></pre>');
        expect(out).toContain('<pre><code>plain</code></pre>');
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

    it('renders inline markup as HTML inside ordered tight lists', () => {
        const out = markdownToTelegramHtml('1. **bold** `code` *italic*');

        expect(out).toContain('1. <b>bold</b> <code>code</code> <i>italic</i>');
        expect(out).not.toContain('&lt;b&gt;');
        expect(out).not.toMatch(/\*\*|`/);
    });

    it('renders inline markup as HTML inside unordered tight lists', () => {
        const out = markdownToTelegramHtml('- **bold** `code` *italic*');

        expect(out).toContain('• <b>bold</b> <code>code</code> <i>italic</i>');
        expect(out).not.toMatch(/&lt;(?:b|code|i)&gt;/);
    });

    it('renders inline markup in the middle of list item text', () => {
        const out = markdownToTelegramHtml(
            '- While editing, `/x` is a **literal** character.'
        );

        expect(out).toContain(
            '• While editing, <code>/x</code> is a <b>literal</b> character.'
        );
    });

    it('renders inline markup in loose multi-paragraph lists', () => {
        const out = markdownToTelegramHtml(
            '- First **bold** paragraph.\n\n  Second paragraph with *italic*.\n\n- `code` item.'
        );

        expect(out).toContain('• First <b>bold</b> paragraph.');
        expect(out).toContain('Second paragraph with <i>italic</i>.');
        expect(out).toContain('• <code>code</code> item.');
        expect(out).not.toMatch(/&lt;(?:b|code|i)&gt;/);
    });

    it('renders inline markup in nested list items', () => {
        const out = markdownToTelegramHtml('- **parent**\n  - child with `code`');

        expect(out).toContain('• <b>parent</b>');
        expect(out).toContain('• child with <code>code</code>');
    });

    it('escapes raw HTML inside list items', () => {
        const out = markdownToTelegramHtml('- literal <script>alert(1)</script> text');

        expect(out).toContain('&lt;script&gt;');
        expect(out).not.toContain('<script>');
    });

    it('preserves ordered list start numbering with inline markup', () => {
        const out = markdownToTelegramHtml('3. **three**\n4. *four*');

        expect(out).toContain('3. <b>three</b>');
        expect(out).toContain('4. <i>four</i>');
    });

    it('renders links as HTML inside list items', () => {
        const out = markdownToTelegramHtml('- See [docs](https://example.com?a=1&b=2).');

        expect(out).toContain(
            '• See <a href="https://example.com?a=1&amp;b=2">docs</a>.'
        );
        expect(out).not.toContain('&lt;a href=');
    });

    it('renders tables as ASCII inside <pre>', () => {
        const md = '| a | b |\n|---|---|\n| 1 | 2 |\n| 3 |';
        const out = markdownToTelegramHtml(md);
        expect(out.startsWith('<pre>')).toBe(true);
        expect(out).toContain('a');
        expect(out).toContain('b');
        expect(out).toContain('1');
        expect(out).toContain('2');
        expect(out).toContain('3');
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
