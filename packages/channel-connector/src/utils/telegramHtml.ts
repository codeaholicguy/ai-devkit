import { Marked, type RendererObject, type Tokens } from 'marked';

const escapeHtml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeUrl = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const renderer: RendererObject = {
    heading({ tokens }: Tokens.Heading): string {
        return `<b>${this.parser.parseInline(tokens)}</b>\n\n`;
    },
    paragraph({ tokens }: Tokens.Paragraph): string {
        return `${this.parser.parseInline(tokens)}\n\n`;
    },
    strong({ tokens }: Tokens.Strong): string {
        return `<b>${this.parser.parseInline(tokens)}</b>`;
    },
    em({ tokens }: Tokens.Em): string {
        return `<i>${this.parser.parseInline(tokens)}</i>`;
    },
    del({ tokens }: Tokens.Del): string {
        return `<s>${this.parser.parseInline(tokens)}</s>`;
    },
    codespan({ text }: Tokens.Codespan): string {
        return `<code>${escapeHtml(text)}</code>`;
    },
    code({ text, lang }: Tokens.Code): string {
        const langAttr = lang ? ` class="language-${escapeHtml(lang.split(/\s/)[0])}"` : '';
        return `<pre><code${langAttr}>${escapeHtml(text)}</code></pre>\n\n`;
    },
    link({ href, tokens }: Tokens.Link): string {
        return `<a href="${escapeUrl(href)}">${this.parser.parseInline(tokens)}</a>`;
    },
    image({ href, text }: Tokens.Image): string {
        const label = text || href;
        return `<a href="${escapeUrl(href)}">${escapeHtml(label)}</a>`;
    },
    list({ items, ordered, start }: Tokens.List): string {
        const startNum = typeof start === 'number' ? start : 1;
        const lines = items.map((item, i) => {
            const marker = ordered ? `${startNum + i}.` : '•';
            const inner = this.parser.parse(item.tokens).trimEnd();
            return `${marker} ${inner}`;
        });
        return `${lines.join('\n')}\n\n`;
    },
    listitem(item: Tokens.ListItem): string {
        return this.parser.parseInline(item.tokens);
    },
    blockquote({ tokens }: Tokens.Blockquote): string {
        return `<blockquote>${this.parser.parse(tokens).trimEnd()}</blockquote>\n\n`;
    },
    table({ header, rows }: Tokens.Table): string {
        const headerCells = header.map((c) => c.text);
        const bodyRows = rows.map((row) => row.map((c) => c.text));
        const widths = headerCells.map((h, i) =>
            Math.max(h.length, ...bodyRows.map((row) => (row[i] ?? '').length))
        );
        const pad = (cells: string[]) =>
            cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join(' | ');

        const lines = [
            pad(headerCells),
            widths.map((w) => '-'.repeat(w)).join('-+-'),
            ...bodyRows.map(pad),
        ];
        return `<pre>${escapeHtml(lines.join('\n'))}</pre>\n\n`;
    },
    hr(): string {
        return '———\n\n';
    },
    br(): string {
        return '\n';
    },
    html(): string {
        return '';
    },
    text(token: Tokens.Text | Tokens.Escape): string {
        if ('tokens' in token && token.tokens) {
            return this.parser.parseInline(token.tokens);
        }
        return escapeHtml(token.text);
    },
};

const marked = new Marked({ renderer });

/**
 * Convert markdown to Telegram-compatible HTML (uses only the tag subset
 * Telegram's Bot API accepts for parse_mode: 'HTML').
 */
export function markdownToTelegramHtml(markdown: string): string {
    return (marked.parse(markdown, { async: false }) as string).trimEnd();
}
