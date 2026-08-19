import { buildSlackQuestionMessage } from '../../../adapters/slack/slackQuestion.js';

describe('buildSlackQuestionMessage', () => {
    it('builds an accessible Block Kit question with optional skip action', () => {
        const message = buildSlackQuestionMessage('D123', {
            id: 'q1',
            header: 'Scope',
            question: 'Choose one',
            allowSkip: true,
            options: [{ label: 'Safe', description: 'Read only', value: '1' }],
        });

        expect(message).toMatchObject({
            channel: 'D123',
            text: 'Scope: Choose one',
            blocks: [
                {
                    type: 'section',
                    text: { type: 'mrkdwn', text: '*Scope*\nChoose one' },
                },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            action_id: 'ai_devkit_question',
                            text: { type: 'plain_text', text: 'Safe' },
                            value: 'q1:1',
                        },
                        {
                            type: 'button',
                            action_id: 'ai_devkit_question',
                            text: { type: 'plain_text', text: 'Skip' },
                            value: 'q1:skip',
                        },
                    ],
                },
            ],
        });
    });

    it('escapes Slack control syntax in fallback and mrkdwn text', () => {
        const message = buildSlackQuestionMessage('D123', {
            id: 'q1',
            header: '<!channel>',
            question: 'Choose <one> & continue',
            allowSkip: false,
            options: [{ label: 'Safe', value: '1' }],
        });

        expect(message.text).toBe('&lt;!channel&gt;: Choose &lt;one&gt; &amp; continue');
        expect(message.blocks[0].text.text).toBe('*&lt;!channel&gt;*\nChoose &lt;one&gt; &amp; continue');
    });

    it('limits button labels and values to Slack bounds', () => {
        const message = buildSlackQuestionMessage('D123', {
            id: 'q1',
            question: 'Choose',
            allowSkip: false,
            options: [{ label: 'A'.repeat(100), value: 'v'.repeat(3000) }],
        });

        const button = message.blocks[1].elements[0];
        expect(button.text.text).toHaveLength(75);
        expect(button.value).toHaveLength(2000);
    });
});
