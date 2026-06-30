import type {
    IncomingCallback,
    InlineKeyboard,
} from '@ai-devkit/channel-connector';
import { createLogger } from '../../util/debug.js';
import { getErrorMessage } from '../../util/text.js';

const debug = createLogger('askuserquestion');

export interface QuestionOption {
    label: string;
    description?: string;
}

export interface QuestionSpec {
    question: string;
    header?: string;
    options: QuestionOption[];
    multiSelect: boolean;
}

interface ActiveSession {
    questionId: string;
    chatId: string;
    spec: QuestionSpec;
    messageId: number | null;
}

/**
 * Subset of TelegramAdapter that this module depends on. Keeps the module
 * easy to unit-test without spinning up a real adapter.
 */
export interface KeyboardChannel {
    sendInlineKeyboard(chatId: string, html: string, keyboard: InlineKeyboard): Promise<number>;
    editInlineKeyboard(chatId: string, messageId: number, keyboard: InlineKeyboard | null): Promise<void>;
    answerCallback(callbackQueryId: string, text?: string): Promise<void>;
}

export type SendToAgent = (message: string) => Promise<void>;

/**
 * Parse a raw `AskUserQuestion` tool input into a normalized question spec.
 *
 * Returns `null` (caller falls back to plain text) when the payload is not a
 * supported shape. Multi-question payloads (`questions.length !== 1`) are
 * rejected because reliably sequencing keystrokes across pickers is fragile;
 * multi-select is supported as a Skip-or-free-text-reply flow (no numbered
 * option buttons).
 */
export function parseAskUserQuestionInput(input: Record<string, unknown>): QuestionSpec | null {
    const raw = input.questions;
    if (!Array.isArray(raw) || raw.length !== 1) return null;
    const q = raw[0];
    if (!q || typeof q !== 'object') return null;
    const qObj = q as Record<string, unknown>;
    if (typeof qObj.question !== 'string') return null;
    if (!Array.isArray(qObj.options) || qObj.options.length === 0) return null;
    const options: QuestionOption[] = [];
    for (const opt of qObj.options) {
        if (!opt || typeof opt !== 'object') return null;
        const optObj = opt as Record<string, unknown>;
        if (typeof optObj.label !== 'string') return null;
        options.push({
            label: optObj.label,
            description: typeof optObj.description === 'string' ? optObj.description : undefined,
        });
    }
    return {
        question: qObj.question,
        header: typeof qObj.header === 'string' ? qObj.header : undefined,
        options,
        multiSelect: qObj.multiSelect === true,
    };
}

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function formatAskUserQuestionBody(spec: QuestionSpec): string {
    const lines: string[] = [];
    if (spec.header) {
        lines.push(`<b>${escapeHtml(spec.header)}</b>`);
    }
    lines.push(escapeHtml(spec.question));
    lines.push('');
    spec.options.forEach((opt, idx) => {
        const desc = opt.description ? ` — <i>${escapeHtml(opt.description)}</i>` : '';
        lines.push(`<b>${idx + 1}.</b> <b>${escapeHtml(opt.label)}</b>${desc}`);
    });
    if (spec.multiSelect) {
        lines.push('');
        lines.push('<i>Multi-select — tap Skip, and answer in chat.</i>');
    }
    return lines.join('\n');
}

/** Esc byte — what the `Skip` button delivers to the picker. */
const SKIP_KEY = '\x1b';

export function buildKeyboard(questionId: string, spec: QuestionSpec): InlineKeyboard {
    const rows: InlineKeyboard = spec.multiSelect
        ? []
        : spec.options.map((opt, idx) => {
            const key = idx + 1;
            return [{
                text: `${key}. ${opt.label}`,
                callbackData: `q:${questionId}:o:${idx}`,
            }];
        });
    rows.push([{ text: 'Skip', callbackData: `q:${questionId}:skip` }]);
    return rows;
}

export class AskUserQuestionService {
    private sessions = new Map<string, ActiveSession>();
    private nextId = 1;

    constructor(
        private readonly telegram: KeyboardChannel,
        private readonly sendToAgent: SendToAgent,
    ) { }

    /**
     * Try to render the given tool input as an inline-keyboard question.
     * Returns `true` if handled, `false` if the caller should fall back to
     * plain-text formatting (e.g. multi-select / multi-question payloads).
     */
    async tryHandle(toolInput: Record<string, unknown>, chatId: string): Promise<boolean> {
        const spec = parseAskUserQuestionInput(toolInput);
        if (!spec) return false;

        const questionId = (this.nextId++).toString(36);
        const session: ActiveSession = { questionId, chatId, spec, messageId: null };
        this.sessions.set(questionId, session);
        await this.render(session);
        return true;
    }

    /**
     * Handle an inline-keyboard tap. Resolves the option (digit key) or Skip
     * (Esc), writes the result to the agent's TTY, and clears the keyboard
     * from the Telegram message.
     */
    async handleCallback(cb: IncomingCallback): Promise<void> {
        const parsed = parseCallbackData(cb.callbackData);
        if (!parsed) {
            await this.safeAnswerCallback(cb.callbackQueryId);
            return;
        }

        const session = this.sessions.get(parsed.questionId);
        if (!session) {
            await this.safeAnswerCallback(cb.callbackQueryId, 'Question expired');
            return;
        }

        if (session.chatId !== cb.chatId) {
            await this.safeAnswerCallback(cb.callbackQueryId);
            return;
        }

        const spec = session.spec;
        let key: string;
        let toast: string;

        if (parsed.kind === 'skip') {
            key = SKIP_KEY;
            toast = 'Skipped';
        } else {
            if (parsed.optionIdx >= spec.options.length) {
                await this.safeAnswerCallback(cb.callbackQueryId);
                return;
            }
            key = String(parsed.optionIdx + 1);
            toast = spec.options[parsed.optionIdx].label;
        }

        await this.safeAnswerCallback(cb.callbackQueryId, toast);
        this.sessions.delete(session.questionId);

        if (session.messageId !== null) {
            try {
                await this.telegram.editInlineKeyboard(session.chatId, session.messageId, null);
            } catch (error) {
                debug(`finalize editInlineKeyboard failed: ${getErrorMessage(error)}`);
            }
        }

        try {
            await this.sendToAgent(key);
        } catch (error) {
            debug(`sendToAgent failed: ${getErrorMessage(error)}`);
        }
    }

    private async render(session: ActiveSession): Promise<void> {
        try {
            session.messageId = await this.telegram.sendInlineKeyboard(
                session.chatId,
                formatAskUserQuestionBody(session.spec),
                buildKeyboard(session.questionId, session.spec),
            );
        } catch (error) {
            debug(`sendInlineKeyboard failed: ${getErrorMessage(error)}`);
            this.sessions.delete(session.questionId);
        }
    }

    private async safeAnswerCallback(callbackQueryId: string, text?: string): Promise<void> {
        try {
            await this.telegram.answerCallback(callbackQueryId, text);
        } catch (error) {
            debug(`answerCallback failed: ${getErrorMessage(error)}`);
        }
    }
}

type ParsedCallback =
    | { kind: 'option'; questionId: string; optionIdx: number }
    | { kind: 'skip'; questionId: string };

function parseCallbackData(data: string): ParsedCallback | null {
    const parts = data.split(':');
    if (parts[0] !== 'q' || parts.length < 3) return null;
    const questionId = parts[1];
    if (parts.length === 4 && parts[2] === 'o') {
        const optionIdx = Number.parseInt(parts[3], 10);
        if (!Number.isFinite(optionIdx)) return null;
        return { kind: 'option', questionId, optionIdx };
    }
    if (parts.length === 3 && parts[2] === 'skip') {
        return { kind: 'skip', questionId };
    }
    return null;
}

