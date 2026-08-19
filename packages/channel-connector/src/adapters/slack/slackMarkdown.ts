import { Marked, type Token, type Tokens } from 'marked';

export const SLACK_MAX_MESSAGE_LENGTH = 4000;
const lexer = new Marked();

export function escapeSlackText(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function markdownToSlackMrkdwn(markdown: string): string {
    return renderBlocks(lexer.lexer(markdown)).trimEnd();
}

export function chunkMarkdownForSlack(
    markdown: string,
    maxLength = SLACK_MAX_MESSAGE_LENGTH,
): string[] {
    const tokens = lexer.lexer(markdown);
    const chunks: string[] = [];
    let current = '';

    const append = (rendered: string): void => {
        if (!rendered) return;
        if (rendered.length > maxLength) {
            if (current) {
                chunks.push(current.trimEnd());
                current = '';
            }
            chunks.push(...splitRendered(rendered.trimEnd(), maxLength));
            return;
        }
        const candidate = current ? `${current}${rendered}` : rendered;
        if (candidate.trimEnd().length <= maxLength) {
            current = candidate;
        } else {
            chunks.push(current.trimEnd());
            current = rendered;
        }
    };

    for (const token of tokens) {
        if (token.type === 'code') {
            const rendered = renderCode(token as Tokens.Code);
            if (rendered.length > maxLength) {
                if (current) {
                    chunks.push(current.trimEnd());
                    current = '';
                }
                chunks.push(...splitCode((token as Tokens.Code).text, maxLength));
                continue;
            }
        }
        append(renderBlock(token));
    }
    if (current.trimEnd()) chunks.push(current.trimEnd());
    return chunks;
}

function renderBlocks(tokens: Token[]): string {
    return tokens.map(renderBlock).join('');
}

function renderBlock(token: Token): string {
    switch (token.type) {
        case 'heading':
            return `*${renderInline((token as Tokens.Heading).tokens)}*\n\n`;
        case 'paragraph':
            return `${renderInline((token as Tokens.Paragraph).tokens)}\n\n`;
        case 'text': {
            const text = token as Tokens.Text;
            return text.tokens ? renderInline(text.tokens) : escapeSlackText(text.text);
        }
        case 'code':
            return `${renderCode(token as Tokens.Code)}\n\n`;
        case 'blockquote':
            return renderBlocks((token as Tokens.Blockquote).tokens)
                .trimEnd().split('\n').map((line) => `> ${line}`).join('\n') + '\n\n';
        case 'list':
            return renderList(token as Tokens.List);
        case 'space':
            return '';
        case 'hr':
            return '—\n\n';
        default:
            return escapeSlackText(token.raw ?? '');
    }
}

function renderInline(tokens: Token[]): string {
    return tokens.map((token) => {
        switch (token.type) {
            case 'text':
                return escapeSlackText((token as Tokens.Text).text);
            case 'strong':
                return `*${renderInline((token as Tokens.Strong).tokens)}*`;
            case 'em':
                return `_${renderInline((token as Tokens.Em).tokens)}_`;
            case 'del':
                return `~${renderInline((token as Tokens.Del).tokens)}~`;
            case 'codespan':
                return `\`${escapeSlackText((token as Tokens.Codespan).text)}\``;
            case 'link': {
                const link = token as Tokens.Link;
                return `<${escapeLinkTarget(link.href)}|${renderInline(link.tokens)}>`;
            }
            case 'br':
                return '\n';
            default:
                return escapeSlackText(token.raw ?? '');
        }
    }).join('');
}

function renderCode(token: Tokens.Code): string {
    return `\`\`\`\n${escapeSlackText(token.text)}\n\`\`\``;
}

function renderList(token: Tokens.List): string {
    return token.items.map((item, index) => {
        const marker = token.ordered ? `${(token.start || 1) + index}.` : '•';
        return `${marker} ${renderBlocks(item.tokens).trim()}\n`;
    }).join('') + '\n';
}

function escapeLinkTarget(href: string): string {
    return href.replace(/&/g, '&amp;').replace(/>/g, '%3E').replace(/\|/g, '%7C');
}

function splitCode(code: string, maxLength: number): string[] {
    const wrapperLength = 8;
    const contentLimit = Math.max(1, maxLength - wrapperLength);
    const parts: string[] = [];
    let current = '';
    for (const char of Array.from(code)) {
        const escaped = escapeSlackText(char);
        if (current.length + escaped.length > contentLimit && current) {
            parts.push(current);
            current = '';
        }
        current += escaped;
    }
    if (current) parts.push(current);
    return parts.map((part) => `\`\`\`\n${part}\n\`\`\``);
}

function splitRendered(text: string, maxLength: number): string[] {
    return splitText(text, maxLength);
}

function splitText(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let current = '';
    for (const unit of text.match(/.*(?:\n|$)|./gu) ?? []) {
        if (!unit) continue;
        for (const char of Array.from(unit)) {
            if (current.length + char.length > maxLength && current) {
                chunks.push(current);
                current = '';
            }
            current += char;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}
