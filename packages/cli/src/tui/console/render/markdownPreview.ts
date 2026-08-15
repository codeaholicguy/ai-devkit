import { Marked, type Token, type Tokens } from 'marked';
import { stripVTControlCharacters } from 'node:util';
import stringWidth from 'string-width';
import { TUI_COLORS } from '../../design-system/index.js';

export interface MarkdownPreviewSpan {
    text: string;
    bold?: boolean;
    italic?: boolean;
    dimColor?: boolean;
    color?: string;
}

export type MarkdownPreviewRow = MarkdownPreviewSpan[];

const markdown = new Marked();
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function isUnsafeControl(character: string): boolean {
    const code = character.codePointAt(0) ?? 0;
    return code <= 8
        || code === 11
        || code === 12
        || (code >= 14 && code <= 31)
        || (code >= 127 && code <= 159);
}

export function sanitizeMarkdownSource(source: string): string {
    return stripVTControlCharacters(source)
        .replace(/\r\n?/g, '\n')
        .replace(/\t/g, '    ')
        .split('')
        .filter(character => !isUnsafeControl(character))
        .join('');
}

function applyStyle(
    spans: MarkdownPreviewSpan[],
    style: Omit<MarkdownPreviewSpan, 'text'>,
): MarkdownPreviewSpan[] {
    return spans.map(span => ({ ...span, ...style }));
}

function literalRows(raw: string): MarkdownPreviewRow[] {
    return raw.replace(/\n$/, '').split('\n').map(text => [{ text }]);
}

function hasClosingCodeFence(raw: string): boolean {
    const lastLine = raw.trimEnd().split('\n').at(-1) ?? '';
    return /^ {0,3}(?:`{3,}|~{3,})\s*$/u.test(lastLine);
}

function splitMarkdownRowAtNewlines(row: MarkdownPreviewRow): MarkdownPreviewRow[] {
    const lines: MarkdownPreviewRow[] = [[]];
    for (const span of row) {
        const parts = span.text.split('\n');
        parts.forEach((part, index) => {
            if (part) lines.at(-1)?.push({ ...span, text: part });
            if (index < parts.length - 1) lines.push([]);
        });
    }
    return lines.map(line => line.length > 0 ? line : [{ text: '' }]);
}

function isRowPrefix(span: MarkdownPreviewSpan | undefined): boolean {
    return Boolean(span && (
        span.text === '  '
        || span.text === '│ '
        || span.text === '• '
        || /^\d+\. $/u.test(span.text)
    ));
}

function continuationPrefix(span: MarkdownPreviewSpan, width: number): MarkdownPreviewSpan[] {
    const prefix = span.text === '│ ' || span.text === '  '
        ? { ...span }
        : { text: ' '.repeat(stringWidth(span.text)) };
    return stringWidth(prefix.text) < width ? [prefix] : [];
}

function splitByDisplayWidth(text: string, available: number): [string, string] {
    let head = '';
    let used = 0;
    const segments = Array.from(graphemeSegmenter.segment(text), item => item.segment);
    let index = 0;
    for (; index < segments.length; index += 1) {
        const segmentWidth = stringWidth(segments[index]);
        if (head && used + segmentWidth > available) break;
        if (!head && segmentWidth > available) {
            head = segments[index];
            index += 1;
            break;
        }
        head += segments[index];
        used += segmentWidth;
    }
    return [head, segments.slice(index).join('')];
}

export function wrapMarkdownRow(row: MarkdownPreviewRow, requestedWidth: number): MarkdownPreviewRow[] {
    const width = Math.max(1, Math.floor(requestedWidth));
    if (row.reduce((total, span) => total + stringWidth(span.text), 0) <= width) return [row];

    const prefixSpan = isRowPrefix(row[0]) ? row[0] : undefined;
    const continuation = prefixSpan ? continuationPrefix(prefixSpan, width) : [];
    const content = prefixSpan ? row.slice(1) : row;
    const output: MarkdownPreviewRow[] = [];
    let current = prefixSpan ? [{ ...prefixSpan }] : [];
    let currentWidth = current.reduce((total, span) => total + stringWidth(span.text), 0);
    let pendingWhitespace: MarkdownPreviewSpan[] = [];

    const resetLine = (): void => {
        current = continuation.map(span => ({ ...span }));
        currentWidth = current.reduce((total, span) => total + stringWidth(span.text), 0);
    };
    const flush = (): void => {
        output.push(current.length > 0 ? current : [{ text: '' }]);
        resetLine();
    };
    const append = (span: MarkdownPreviewSpan): void => {
        current.push(span);
        currentWidth += stringWidth(span.text);
    };

    for (const span of content) {
        for (const piece of span.text.match(/\s+|\S+/gu) ?? ['']) {
            if (/^\s+$/u.test(piece)) {
                pendingWhitespace.push({ ...span, text: piece });
                continue;
            }

            const whitespaceWidth = pendingWhitespace.reduce(
                (total, whitespace) => total + stringWidth(whitespace.text),
                0,
            );
            let remaining = piece;
            const pieceWidth = stringWidth(piece);
            if (currentWidth + whitespaceWidth + pieceWidth > width && currentWidth > 0) {
                flush();
                pendingWhitespace = [];
            } else {
                pendingWhitespace.forEach(append);
                pendingWhitespace = [];
            }

            while (remaining) {
                const firstGrapheme = graphemeSegmenter.segment(remaining)[Symbol.iterator]().next().value?.segment ?? '';
                if (
                    current.length === continuation.length
                    && currentWidth > 0
                    && stringWidth(firstGrapheme) > width - currentWidth
                ) {
                    current = [];
                    currentWidth = 0;
                }
                const available = Math.max(1, width - currentWidth);
                const [head, tail] = splitByDisplayWidth(remaining, available);
                append({ ...span, text: head });
                remaining = tail;
                if (remaining) flush();
            }
        }
    }

    const isBareContinuation = current.length === continuation.length
        && current.every((span, index) => span.text === continuation[index]?.text);
    if (!isBareContinuation || output.length === 0) output.push(current);
    return output;
}

function renderInline(tokens: Token[]): MarkdownPreviewSpan[] {
    return tokens.flatMap<MarkdownPreviewSpan>((token) => {
        switch (token.type) {
            case 'text': {
                const text = token as Tokens.Text;
                return text.tokens ? renderInline(text.tokens) : [{ text: text.text }];
            }
            case 'strong':
                return applyStyle(renderInline((token as Tokens.Strong).tokens), { bold: true });
            case 'em':
                return applyStyle(renderInline((token as Tokens.Em).tokens), { italic: true });
            case 'codespan':
                return [{ text: (token as Tokens.Codespan).text, color: TUI_COLORS.warning }];
            case 'link': {
                const link = token as Tokens.Link;
                const label = applyStyle(renderInline(link.tokens), { color: TUI_COLORS.accent });
                const labelText = label.map(span => span.text).join('');
                return labelText === link.href
                    ? label
                    : [...label, { text: ` (${link.href})`, dimColor: true }];
            }
            case 'image': {
                const image = token as Tokens.Image;
                const label = image.text || 'image';
                return [
                    { text: `[image: ${label}]`, dimColor: true },
                    { text: ` (${image.href})`, dimColor: true },
                ];
            }
            default:
                return [{ text: token.raw ?? '' }];
        }
    });
}

function renderBlock(token: Token): MarkdownPreviewRow[] {
    switch (token.type) {
        case 'heading':
            return [applyStyle(renderInline((token as Tokens.Heading).tokens), {
                bold: true,
                color: TUI_COLORS.accent,
            })];
        case 'paragraph':
            return [renderInline((token as Tokens.Paragraph).tokens)];
        case 'code': {
            const code = token as Tokens.Code;
            const language = code.lang?.trim().split(/\s+/)[0] ?? '';
            return [
                [{ text: `\`\`\`${language}`, dimColor: true }],
                ...code.text.split('\n').map(line => [
                    { text: '  ' },
                    { text: line, color: TUI_COLORS.warning },
                ]),
                [{
                    text: hasClosingCodeFence(code.raw) ? '```' : '[unterminated code fence]',
                    dimColor: true,
                }],
            ];
        }
        case 'list': {
            const list = token as Tokens.List;
            const start = typeof list.start === 'number' ? list.start : 1;
            return list.items.flatMap((item, index) => {
                const marker = list.ordered ? `${start + index}. ` : '• ';
                const itemRows = item.tokens.flatMap(renderBlock);
                if (itemRows.length === 0) return [[{ text: marker.trimEnd() }]];
                return itemRows.map((row, rowIndex) => [
                    { text: rowIndex === 0 ? marker : ' '.repeat(marker.length) },
                    ...row,
                ]);
            });
        }
        case 'blockquote':
            return (token as Tokens.Blockquote).tokens.flatMap(renderBlock).map(row => [
                { text: '│ ', dimColor: true },
                ...row,
            ]);
        case 'text': {
            const text = token as Tokens.Text;
            return [text.tokens ? renderInline(text.tokens) : [{ text: text.text }]];
        }
        case 'space':
            return [[{ text: '' }]];
        default:
            return literalRows(token.raw ?? '');
    }
}

export function renderMarkdownRows(source: string, _width: number): MarkdownPreviewRow[] {
    const sanitized = sanitizeMarkdownSource(source);
    try {
        const rows = markdown.lexer(sanitized).flatMap(renderBlock);
        const safeRows = rows.length > 0 ? rows : [[{ text: '' }]];
        return safeRows
            .flatMap(splitMarkdownRowAtNewlines)
            .flatMap(row => wrapMarkdownRow(row, _width));
    } catch {
        return literalRows(sanitized)
            .flatMap(splitMarkdownRowAtNewlines)
            .flatMap(row => wrapMarkdownRow(row, _width));
    }
}
