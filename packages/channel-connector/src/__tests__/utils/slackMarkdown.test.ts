import {
    SLACK_MAX_MESSAGE_LENGTH,
    chunkMarkdownForSlack,
    markdownToSlackMrkdwn,
} from '../../utils/slackMarkdown.js';

describe('Slack Markdown', () => {
    it('renders common Markdown without activating broad mentions', () => {
        expect(markdownToSlackMrkdwn('# Result\n\n**Passed** & <safe> @channel [docs](https://example.com)'))
            .toBe('*Result*\n\n*Passed* &amp; &lt;safe&gt; @channel <https://example.com|docs>');
    });

    it('preserves inline and fenced code while escaping Slack control characters', () => {
        expect(markdownToSlackMrkdwn('Use `<tag>`\n\n```ts\nconst x = "<ok>";\n```'))
            .toContain('`&lt;tag&gt;`\n\n```\nconst x = "&lt;ok&gt;";\n```');
    });

    it('chunks long fenced code into independently fenced Slack messages', () => {
        const chunks = chunkMarkdownForSlack(`\`\`\`ts\n${'const value = 1;\n'.repeat(400)}\`\`\``);
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every((chunk) => chunk.length <= SLACK_MAX_MESSAGE_LENGTH)).toBe(true);
        expect(chunks.every((chunk) => chunk.startsWith('```') && chunk.endsWith('```'))).toBe(true);
    });

    it('accounts for escaped control-character expansion in code chunks', () => {
        const chunks = chunkMarkdownForSlack(`\`\`\`\n${'<&>'.repeat(2000)}\n\`\`\``);
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every((chunk) => chunk.length <= SLACK_MAX_MESSAGE_LENGTH)).toBe(true);
        expect(chunks.every((chunk) => chunk.startsWith('```') && chunk.endsWith('```'))).toBe(true);
    });

    it('splits Unicode text without breaking code points', () => {
        const chunks = chunkMarkdownForSlack('🎉'.repeat(5000));
        expect(chunks.join('')).toBe('🎉'.repeat(5000));
        expect(chunks.every((chunk) => chunk.length <= SLACK_MAX_MESSAGE_LENGTH)).toBe(true);
    });

    it('renders lists, quotes, emphasis, strike, breaks, and rules conservatively', () => {
        const rendered = markdownToSlackMrkdwn('1. _one_\n2. ~~two~~\n\n> quoted  \n> next\n\n---');
        expect(rendered).toContain('1. _one_');
        expect(rendered).toContain('2. ~two~');
        expect(rendered).toContain('> quoted');
        expect(rendered).toContain('> next');
        expect(rendered).toContain('—');
    });

    it('packs short semantic blocks and splits oversized plain paragraphs', () => {
        expect(chunkMarkdownForSlack('one\n\ntwo', 20)).toEqual(['one\n\ntwo']);
        const chunks = chunkMarkdownForSlack('word '.repeat(30), 25);
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every((chunk) => chunk.length <= 25)).toBe(true);
    });
});
