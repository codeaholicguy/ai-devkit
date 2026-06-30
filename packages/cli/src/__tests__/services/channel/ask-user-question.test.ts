import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    AskUserQuestionService,
    buildKeyboard,
    escapeHtml,
    formatAskUserQuestionBody,
    parseAskUserQuestionInput,
    type KeyboardChannel,
    type QuestionSpec,
} from '../../../services/channel/ask-user-question.js';
import type { IncomingCallback } from '@ai-devkit/channel-connector';

const baseCallback = (data: string): IncomingCallback => ({
    channelType: 'telegram',
    chatId: 'chat-1',
    userId: 'user-1',
    messageId: 1001,
    callbackData: data,
    callbackQueryId: 'cbq-1',
    timestamp: new Date(0),
});

function makeChannel(): KeyboardChannel & {
    sendInlineKeyboard: ReturnType<typeof vi.fn>;
    editInlineKeyboard: ReturnType<typeof vi.fn>;
    answerCallback: ReturnType<typeof vi.fn>;
} {
    let nextMessageId = 1000;
    return {
        sendInlineKeyboard: vi.fn().mockImplementation(async () => ++nextMessageId),
        editInlineKeyboard: vi.fn().mockResolvedValue(undefined),
        answerCallback: vi.fn().mockResolvedValue(undefined),
    };
}

describe('parseAskUserQuestionInput', () => {
    it('parses a single-select single-question payload', () => {
        const parsed = parseAskUserQuestionInput({
            questions: [{
                question: 'Pick one',
                header: 'Next action',
                multiSelect: false,
                options: [
                    { label: 'A', description: 'first' },
                    { label: 'B' },
                ],
            }],
        });
        expect(parsed).toEqual({
            question: 'Pick one',
            header: 'Next action',
            multiSelect: false,
            options: [
                { label: 'A', description: 'first' },
                { label: 'B', description: undefined },
            ],
        });
    });

    it('parses a multi-select single-question payload with multiSelect=true', () => {
        const parsed = parseAskUserQuestionInput({
            questions: [{
                question: 'Pick many',
                multiSelect: true,
                options: [{ label: 'A' }, { label: 'B' }],
            }],
        });
        expect(parsed?.multiSelect).toBe(true);
        expect(parsed?.options).toHaveLength(2);
    });

    it('rejects multi-question payloads (fallback)', () => {
        expect(parseAskUserQuestionInput({
            questions: [
                { question: 'q1', options: [{ label: 'A' }] },
                { question: 'q2', options: [{ label: 'B' }] },
            ],
        })).toBeNull();
    });

    it('returns null when `questions` is missing', () => {
        expect(parseAskUserQuestionInput({ question: 'x' })).toBeNull();
    });

    it('returns null when an option has no label', () => {
        expect(parseAskUserQuestionInput({
            questions: [{ question: 'q', options: [{}] }],
        })).toBeNull();
    });

    it('returns null when options is empty', () => {
        expect(parseAskUserQuestionInput({
            questions: [{ question: 'q', options: [] }],
        })).toBeNull();
    });
});

describe('escapeHtml', () => {
    it('escapes <, >, &, "', () => {
        expect(escapeHtml('a < b & c > "d"')).toBe('a &lt; b &amp; c &gt; &quot;d&quot;');
    });
});

describe('formatAskUserQuestionBody', () => {
    const spec: QuestionSpec = {
        question: 'Pick',
        header: 'Choose',
        multiSelect: false,
        options: [
            { label: 'Alpha', description: 'first' },
            { label: 'Beta' },
        ],
    };

    it('includes header, question, and numbered options with descriptions', () => {
        const out = formatAskUserQuestionBody(spec);
        expect(out).toContain('<b>Choose</b>');
        expect(out).toContain('Pick');
        expect(out).toContain('<b>1.</b> <b>Alpha</b> — <i>first</i>');
        expect(out).toContain('<b>2.</b> <b>Beta</b>');
        expect(out).not.toContain('Multi-select');
    });

    it('omits header line when header is undefined', () => {
        const out = formatAskUserQuestionBody({ ...spec, header: undefined });
        expect(out).not.toContain('<b>Choose</b>');
        expect(out.split('\n')[0]).toBe('Pick');
    });

    it('adds reply-in-chat hint for multi-select', () => {
        const out = formatAskUserQuestionBody({ ...spec, multiSelect: true });
        expect(out).toContain('Multi-select — tap Skip, and answer in chat.');
    });

    it('html-escapes user-controlled fields', () => {
        const out = formatAskUserQuestionBody({
            question: 'Pick <one>',
            header: '<script>',
            multiSelect: false,
            options: [{ label: 'A & B', description: '<i>' }],
        });
        expect(out).toContain('Pick &lt;one&gt;');
        expect(out).toContain('&lt;script&gt;');
        expect(out).toContain('A &amp; B');
        expect(out).toContain('&lt;i&gt;');
    });
});

describe('buildKeyboard', () => {
    const spec: QuestionSpec = {
        question: 'q',
        multiSelect: false,
        options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }],
    };

    it('renders one numbered button per option plus a Skip row (single-select)', () => {
        const kb = buildKeyboard('abc', spec);
        expect(kb).toHaveLength(5);
        expect(kb[0][0]).toEqual({ text: '1. A', callbackData: 'q:abc:o:0' });
        expect(kb[3][0]).toEqual({ text: '4. D', callbackData: 'q:abc:o:3' });
        expect(kb[4][0]).toEqual({ text: 'Skip', callbackData: 'q:abc:skip' });
    });

    it('renders only the Skip row for multi-select', () => {
        const kb = buildKeyboard('abc', { ...spec, multiSelect: true });
        expect(kb).toHaveLength(1);
        expect(kb[0][0]).toEqual({ text: 'Skip', callbackData: 'q:abc:skip' });
    });

    it('keeps every callback_data ≤ 64 bytes', () => {
        const kb = buildKeyboard('zzzzzzzz', spec);
        for (const row of kb) for (const btn of row) {
            expect(Buffer.byteLength(btn.callbackData, 'utf8')).toBeLessThanOrEqual(64);
        }
    });
});

describe('AskUserQuestionService', () => {
    let channel: ReturnType<typeof makeChannel>;
    let sendToAgent: ReturnType<typeof vi.fn>;
    let svc: AskUserQuestionService;

    beforeEach(() => {
        channel = makeChannel();
        sendToAgent = vi.fn().mockResolvedValue(undefined);
        svc = new AskUserQuestionService(channel, sendToAgent);
    });

    it('sends digit key (optionIdx + 1) when option is tapped', async () => {
        const handled = await svc.tryHandle({
            questions: [{
                question: 'Pick',
                multiSelect: false,
                options: [{ label: 'Alpha' }, { label: 'Beta' }, { label: 'Gamma' }],
            }],
        }, 'chat-1');
        expect(handled).toBe(true);
        const kb = channel.sendInlineKeyboard.mock.calls[0][2] as Array<Array<{ callbackData: string }>>;

        await svc.handleCallback(baseCallback(kb[1][0].callbackData));

        expect(sendToAgent).toHaveBeenCalledWith('2');
    });

    it('removes the keyboard after the tap', async () => {
        await svc.tryHandle({
            questions: [{ question: 'q', multiSelect: false, options: [{ label: 'A' }] }],
        }, 'chat-1');
        const kb = channel.sendInlineKeyboard.mock.calls[0][2] as Array<Array<{ callbackData: string }>>;
        const sentMessageId = await channel.sendInlineKeyboard.mock.results[0].value;

        await svc.handleCallback(baseCallback(kb[0][0].callbackData));

        expect(channel.editInlineKeyboard).toHaveBeenCalledWith('chat-1', sentMessageId, null);
    });

    it('shows toast with the chosen label', async () => {
        await svc.tryHandle({
            questions: [{ question: 'q', multiSelect: false, options: [{ label: 'Alpha' }] }],
        }, 'chat-1');
        const kb = channel.sendInlineKeyboard.mock.calls[0][2] as Array<Array<{ callbackData: string }>>;
        await svc.handleCallback(baseCallback(kb[0][0].callbackData));
        expect(channel.answerCallback).toHaveBeenCalledWith('cbq-1', 'Alpha');
    });

    it('returns false on malformed payload (caller falls back)', async () => {
        const handled = await svc.tryHandle({ question: 'plain' }, 'chat-1');
        expect(handled).toBe(false);
        expect(channel.sendInlineKeyboard).not.toHaveBeenCalled();
    });

    it('handles multi-select payload by rendering a Skip-only keyboard', async () => {
        const handled = await svc.tryHandle({
            questions: [{ question: 'Pick many', multiSelect: true, options: [{ label: 'A' }, { label: 'B' }] }],
        }, 'chat-1');
        expect(handled).toBe(true);
        expect(channel.sendInlineKeyboard).toHaveBeenCalledOnce();
        const [, html, kb] = channel.sendInlineKeyboard.mock.calls[0];
        expect(html).toContain('Multi-select');
        expect(kb).toHaveLength(1);
        expect((kb as Array<Array<{ text: string }>>)[0][0].text).toBe('Skip');
    });

    it('returns false on multi-question payload (caller falls back)', async () => {
        const handled = await svc.tryHandle({
            questions: [
                { question: 'q1', options: [{ label: 'A' }] },
                { question: 'q2', options: [{ label: 'B' }] },
            ],
        }, 'chat-1');
        expect(handled).toBe(false);
        expect(channel.sendInlineKeyboard).not.toHaveBeenCalled();
    });

    it('shows "Question expired" toast on unknown questionId', async () => {
        await svc.handleCallback(baseCallback('q:zz:o:0'));
        expect(channel.answerCallback).toHaveBeenCalledWith('cbq-1', 'Question expired');
        expect(sendToAgent).not.toHaveBeenCalled();
    });

    it('ignores callback with mismatched chatId', async () => {
        await svc.tryHandle({
            questions: [{ question: 'q', multiSelect: false, options: [{ label: 'A' }] }],
        }, 'chat-1');
        const data = (channel.sendInlineKeyboard.mock.calls[0][2] as Array<Array<{ callbackData: string }>>)[0][0].callbackData;
        await svc.handleCallback({ ...baseCallback(data), chatId: 'someone-else' });
        expect(sendToAgent).not.toHaveBeenCalled();
    });

    it('ignores callbacks with malformed data', async () => {
        await svc.handleCallback(baseCallback('garbage'));
        expect(channel.answerCallback).toHaveBeenCalledWith('cbq-1', undefined);
        expect(sendToAgent).not.toHaveBeenCalled();
    });

    it('sends Esc byte (\\x1b) and "Skipped" toast when Skip is tapped', async () => {
        await svc.tryHandle({
            questions: [{
                question: 'Pick',
                multiSelect: false,
                options: [{ label: 'Alpha' }, { label: 'Beta' }],
            }],
        }, 'chat-1');
        const kb = channel.sendInlineKeyboard.mock.calls[0][2] as Array<Array<{ text: string; callbackData: string }>>;
        const skipData = kb[kb.length - 1][0].callbackData;
        expect(skipData).toBe('q:1:skip');

        await svc.handleCallback(baseCallback(skipData));

        expect(sendToAgent).toHaveBeenCalledWith('\x1b');
        expect(channel.answerCallback).toHaveBeenCalledWith('cbq-1', 'Skipped');
        expect(channel.editInlineKeyboard).toHaveBeenCalledWith('chat-1', expect.any(Number), null);
    });

    it('ignores callbacks with out-of-range option index', async () => {
        await svc.tryHandle({
            questions: [{ question: 'q', multiSelect: false, options: [{ label: 'A' }] }],
        }, 'chat-1');
        await svc.handleCallback(baseCallback('q:1:o:5'));
        expect(sendToAgent).not.toHaveBeenCalled();
    });
});
