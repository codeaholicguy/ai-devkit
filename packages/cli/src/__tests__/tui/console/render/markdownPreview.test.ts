import { describe, expect, it } from 'vitest';
import { renderMarkdownRows } from '../../../../tui/console/render/markdownPreview.js';

describe('renderMarkdownRows', () => {
    it('renders headings and inline emphasis as styled terminal spans', () => {
        expect(renderMarkdownRows('# Heading\nPlain **bold** and *soft* with `code`', 80)).toEqual([
            [{ text: 'Heading', bold: true, color: 'cyan' }],
            [
                { text: 'Plain ' },
                { text: 'bold', bold: true },
                { text: ' and ' },
                { text: 'soft', italic: true },
                { text: ' with ' },
                { text: 'code', color: 'yellow' },
            ],
        ]);
    });

    it('renders fenced code as literal styled rows with a language label', () => {
        expect(renderMarkdownRows('```ts\nconst answer = 42;\nreturn answer;\n```', 80)).toEqual([
            [{ text: '```ts', dimColor: true }],
            [{ text: '  ' }, { text: 'const answer = 42;', color: 'yellow' }],
            [{ text: '  ' }, { text: 'return answer;', color: 'yellow' }],
            [{ text: '```', dimColor: true }],
        ]);
    });

    it('renders unordered and ordered list markers with inline styles', () => {
        expect(renderMarkdownRows('- first **item**\n- second\n\n3. third\n4. fourth', 80)).toEqual([
            [{ text: '• ' }, { text: 'first ' }, { text: 'item', bold: true }],
            [{ text: '• ' }, { text: 'second' }],
            [{ text: '' }],
            [{ text: '3. ' }, { text: 'third' }],
            [{ text: '4. ' }, { text: 'fourth' }],
        ]);
    });

    it('renders blockquotes with a dim terminal prefix', () => {
        expect(renderMarkdownRows('> quoted **boldly**', 80)).toEqual([
            [{ text: '│ ', dimColor: true }, { text: 'quoted ' }, { text: 'boldly', bold: true }],
        ]);
    });

    it('renders links as a terminal-friendly label and inert destination', () => {
        expect(renderMarkdownRows('See [the docs](https://example.com/guide).', 80)).toEqual([
            [
                { text: 'See ' },
                { text: 'the docs', color: 'cyan' },
                { text: ' (https://example.com/guide)', dimColor: true },
                { text: '.' },
            ],
        ]);
    });

    it('keeps raw HTML, images, and unsupported tables inert and readable', () => {
        const rows = renderMarkdownRows(
            '<b>not rendered</b>\n\n![diagram](https://example.com/image.png)\n\n| A | B |\n| - | - |\n| 1 | 2 |',
            80,
        );

        expect(rows).toEqual([
            [{ text: '<b>' }, { text: 'not rendered' }, { text: '</b>' }],
            [{ text: '' }],
            [
                { text: '[image: diagram]', dimColor: true },
                { text: ' (https://example.com/image.png)', dimColor: true },
            ],
            [{ text: '' }],
            [{ text: '| A | B |' }],
            [{ text: '| - | - |' }],
            [{ text: '| 1 | 2 |' }],
        ]);
    });

    it('removes ANSI, OSC, and unsafe control characters before parsing', () => {
        const source = '\u001B[31m# Red\u001B[0m\nText\u0000 safe \u001B]8;;https://evil.test\u0007click\u001B]8;;\u0007';
        const rows = renderMarkdownRows(source, 80);
        const plainText = rows.map(row => row.map(span => span.text).join('')).join('\n');

        expect(plainText).toBe('Red\nText safe click');
        expect(Array.from(plainText).some((character) => {
            const code = character.codePointAt(0) ?? 0;
            return code <= 8 || code === 11 || code === 12
                || (code >= 14 && code <= 31) || (code >= 127 && code <= 159);
        })).toBe(false);
    });

    it('keeps an empty message as one safe blank terminal row', () => {
        expect(renderMarkdownRows('', 80)).toEqual([[{ text: '' }]]);
    });

    it('wraps list content to physical rows with hanging indentation', () => {
        expect(renderMarkdownRows('- alpha beta gamma', 10)).toEqual([
            [{ text: '• ' }, { text: 'alpha' }],
            [{ text: '  ' }, { text: 'beta' }],
            [{ text: '  ' }, { text: 'gamma' }],
        ]);
    });

    it('does not let a wide grapheme overflow a narrow continuation prefix', () => {
        expect(renderMarkdownRows('- 界x', 3)).toEqual([
            [{ text: '• ' }],
            [{ text: '界x' }],
        ]);
    });

    it('turns Markdown source line breaks into separately counted terminal rows', () => {
        expect(renderMarkdownRows('first line\nsecond **line**', 80)).toEqual([
            [{ text: 'first line' }],
            [{ text: 'second ' }, { text: 'line', bold: true }],
        ]);
    });

    it('marks an unterminated fenced block as malformed but keeps its content readable', () => {
        expect(renderMarkdownRows('```ts\nconst answer = 42;', 80)).toEqual([
            [{ text: '```ts', dimColor: true }],
            [{ text: '  ' }, { text: 'const answer = 42;', color: 'yellow' }],
            [{ text: '[unterminated code fence]', dimColor: true }],
        ]);
    });
});
