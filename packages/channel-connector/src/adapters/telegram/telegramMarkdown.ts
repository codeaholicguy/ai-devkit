import { Marked, type Token, type Tokens } from 'marked';
import { markdownToTelegramHtml } from './telegramHtml.js';

const markdownLexer = new Marked();

export type TelegramMessageChunk = {
    text: string;
    html: boolean;
};

export function isParseEntitiesError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const description = (error as { description?: string }).description;
    const message = (error as { message?: string }).message;
    return ((description ?? '') + (message ?? '')).includes("can't parse entities");
}

export function htmlToPlainText(html: string): string {
    return html
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');
}

export function chunkMarkdownForTelegram(markdown: string, maxLen: number): TelegramMessageChunk[] {
    const markdownChunks = splitMarkdownSource(markdown, maxLen);
    const chunks: TelegramMessageChunk[] = [];

    for (const markdownChunk of markdownChunks) {
        const html = markdownToTelegramHtml(markdownChunk);
        if (html.length <= maxLen) {
            if (html.length > 0) chunks.push({ text: html, html: true });
            continue;
        }

        for (const plainChunk of chunkMessage(markdownChunk, maxLen)) {
            if (plainChunk.length > 0) chunks.push({ text: plainChunk, html: false });
        }
    }

    return chunks;
}

function splitMarkdownSource(markdown: string, maxLen: number, depth = 0): string[] {
    if (markdown.length === 0) return [];
    if (renderedLengthFits(markdown, maxLen)) return [markdown];
    if (depth > 6) return splitPlainMarkdownText(markdown, maxLen);

    const chunks: string[] = [];
    let current = '';
    const tokens = markdownLexer.lexer(markdown);

    for (const token of tokens) {
        const raw = token.raw ?? '';
        if (raw.length === 0) continue;

        const candidate = current + raw;
        if (candidate.length > 0 && renderedLengthFits(candidate, maxLen)) {
            current = candidate;
            continue;
        }

        if (current.length > 0) {
            chunks.push(current);
            current = '';
        }

        if (renderedLengthFits(raw, maxLen)) {
            current = raw;
        } else {
            chunks.push(...splitOversizedToken(token, maxLen, depth + 1));
        }
    }

    if (current.length > 0) chunks.push(current);
    return chunks.flatMap((chunk) => renderedLengthFits(chunk, maxLen) ? [chunk] : splitPlainMarkdownText(chunk, maxLen));
}

function splitOversizedToken(token: Token, maxLen: number, depth: number): string[] {
    switch (token.type) {
        case 'code':
            return splitCodeToken(token as Tokens.Code, maxLen);
        case 'list':
            return splitListToken(token as Tokens.List, maxLen, depth);
        case 'paragraph':
        case 'text':
            return splitPlainMarkdownText(token.raw, maxLen);
        default:
            if ('tokens' in token && Array.isArray(token.tokens) && token.raw !== undefined) {
                return splitMarkdownSource(token.raw, maxLen, depth);
            }
            return splitPlainMarkdownText(token.raw ?? '', maxLen);
    }
}

function splitListToken(token: Tokens.List, maxLen: number, depth: number): string[] {
    const chunks: string[] = [];
    let current = '';

    for (const item of token.items) {
        const raw = item.raw;
        const candidate = current + raw;
        if (candidate.length > 0 && renderedLengthFits(candidate, maxLen)) {
            current = candidate;
            continue;
        }

        if (current.length > 0) {
            chunks.push(current);
            current = '';
        }

        if (renderedLengthFits(raw, maxLen)) {
            current = raw;
        } else {
            chunks.push(...splitMarkdownSource(raw, maxLen, depth + 1));
        }
    }

    if (current.length > 0) chunks.push(current);
    return chunks;
}

function splitCodeToken(token: Tokens.Code, maxLen: number): string[] {
    const fence = token.raw.startsWith('~~~') ? '~~~' : '```';
    const lang = token.lang ? token.lang.split(/\s/)[0] : '';
    const lines = token.text.split('\n');
    const chunks: string[] = [];
    let currentLines: string[] = [];

    const renderFence = (codeLines: string[]): string =>
        `${fence}${lang}\n${codeLines.join('\n')}\n${fence}\n\n`;

    for (const line of lines) {
        const candidateLines = [...currentLines, line];
        if (renderedLengthFits(renderFence(candidateLines), maxLen)) {
            currentLines = candidateLines;
            continue;
        }

        if (currentLines.length > 0) {
            chunks.push(renderFence(currentLines));
            currentLines = [];
        }

        if (renderedLengthFits(renderFence([line]), maxLen)) {
            currentLines = [line];
        } else {
            for (const segment of splitCodeLine(line, fence, lang, maxLen)) {
                chunks.push(renderFence([segment]));
            }
        }
    }

    if (currentLines.length > 0) chunks.push(renderFence(currentLines));
    return chunks;
}

function splitCodeLine(line: string, fence: string, lang: string, maxLen: number): string[] {
    const segments: string[] = [];
    let current = '';
    const renderFence = (value: string): string => `${fence}${lang}\n${value}\n${fence}\n\n`;

    for (const char of Array.from(line)) {
        const candidate = current + char;
        if (renderedLengthFits(renderFence(candidate), maxLen)) {
            current = candidate;
            continue;
        }

        if (current.length > 0) {
            segments.push(current);
            current = '';
        }

        if (renderedLengthFits(renderFence(char), maxLen)) {
            current = char;
        } else {
            segments.push(char);
        }
    }

    if (current.length > 0) segments.push(current);
    return segments;
}

function splitPlainMarkdownText(markdown: string, maxLen: number): string[] {
    if (markdown.length === 0) return [];
    if (renderedLengthFits(markdown, maxLen)) return [markdown];

    const newlineUnits = markdown.split(/(?<=\n)/u);
    if (newlineUnits.length > 1) {
        return packMarkdownUnits(newlineUnits, maxLen, splitPlainMarkdownText);
    }

    const sentenceUnits = markdown.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/gu);
    if (sentenceUnits && sentenceUnits.length > 1) {
        return packMarkdownUnits(sentenceUnits, maxLen, splitPlainMarkdownText);
    }

    const wordUnits = markdown.match(/\S+\s*/gu);
    if (wordUnits && wordUnits.length > 1) {
        return packMarkdownUnits(wordUnits, maxLen, splitPlainMarkdownText);
    }

    return splitByCodePoint(markdown, maxLen);
}

function packMarkdownUnits(
    units: string[],
    maxLen: number,
    splitOversized: (unit: string, maxLen: number) => string[],
): string[] {
    const chunks: string[] = [];
    let current = '';

    for (const unit of units) {
        const candidate = current + unit;
        if (renderedLengthFits(candidate, maxLen)) {
            current = candidate;
            continue;
        }

        if (current.length > 0) {
            chunks.push(current);
            current = '';
        }

        if (renderedLengthFits(unit, maxLen)) {
            current = unit;
        } else {
            chunks.push(...splitOversized(unit, maxLen));
        }
    }

    if (current.length > 0) chunks.push(current);
    return chunks;
}

function splitByCodePoint(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    let current = '';

    for (const char of Array.from(text)) {
        const candidate = current + char;
        if (renderedLengthFits(candidate, maxLen)) {
            current = candidate;
            continue;
        }

        if (current.length > 0) {
            chunks.push(current);
            current = '';
        }

        if (renderedLengthFits(char, maxLen)) {
            current = char;
        } else {
            chunks.push(char);
        }
    }

    if (current.length > 0) chunks.push(current);
    return chunks;
}

function renderedLengthFits(markdown: string, maxLen: number): boolean {
    return markdownToTelegramHtml(markdown).length <= maxLen;
}

/**
 * Split text into chunks of maxLen or fewer characters. Prefers paragraph
 * boundaries (\n\n), then single newlines (\n), then hard-splits at maxLen.
 */
export function chunkMessage(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }

        const lastParagraph = remaining.lastIndexOf('\n\n', maxLen - 2);
        const lastNewline = remaining.lastIndexOf('\n', maxLen - 1);

        let splitAt: number;
        if (lastParagraph > 0) {
            splitAt = lastParagraph + 2;
        } else if (lastNewline > 0) {
            splitAt = lastNewline + 1;
        } else {
            splitAt = maxLen;
        }

        chunks.push(remaining.slice(0, splitAt));
        remaining = remaining.slice(splitAt);
    }

    return chunks;
}
