import type { ChannelQuestion } from '../../types.js';
import { escapeSlackText } from './slackMarkdown.js';

interface SlackQuestionButton {
    type: 'button';
    action_id: 'ai_devkit_question';
    text: { type: 'plain_text'; text: string };
    value: string;
}

type SlackQuestionMessage = Record<string, unknown> & {
    channel: string;
    text: string;
    blocks: [
        {
            type: 'section';
            text: { type: 'mrkdwn'; text: string };
        },
        {
            type: 'actions';
            elements: SlackQuestionButton[];
        },
    ];
};

export function buildSlackQuestionMessage(chatId: string, question: ChannelQuestion): SlackQuestionMessage {
    const fallbackPrefix = question.header ? `${question.header}: ` : '';
    const fallback = escapeSlackText(`${fallbackPrefix}${question.question}`);
    const buttons = question.options.map((option): SlackQuestionButton => ({
        type: 'button',
        action_id: 'ai_devkit_question',
        text: { type: 'plain_text', text: option.label.slice(0, 75) },
        value: `${question.id}:${option.value}`.slice(0, 2000),
    }));

    if (question.allowSkip) {
        buttons.push({
            type: 'button',
            action_id: 'ai_devkit_question',
            text: { type: 'plain_text', text: 'Skip' },
            value: `${question.id}:skip`,
        });
    }

    return {
        channel: chatId,
        text: fallback,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${escapeSlackText(question.header ?? 'Question')}*\n${escapeSlackText(question.question)}`,
                },
            },
            {
                type: 'actions',
                elements: buttons,
            },
        ],
    };
}
