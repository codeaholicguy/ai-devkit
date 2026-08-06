import { EventEmitter } from 'node:events';
import { SlackAdapter, validateSlackAppToken, validateSlackCredentials } from '../../adapters/SlackAdapter.js';
import type { SlackConfig } from '../../types.js';

class FakeSocketClient extends EventEmitter {
    start = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
}

const config: SlackConfig = {
    appToken: 'xapp-fake',
    botToken: 'xoxb-fake',
    appId: 'A123',
    botUserId: 'U-BOT',
    workspaceId: 'T123',
    transport: 'socket-mode',
    audience: 'dm',
};

function envelope(overrides: Record<string, unknown> = {}) {
    return {
        type: 'events_api',
        ack: vi.fn().mockResolvedValue(undefined),
        body: {
            team_id: 'T123',
            event_id: 'Ev123',
            event: {
                type: 'message',
                channel_type: 'im',
                channel: 'D123',
                user: 'U123',
                text: 'run tests',
                ts: '100.1',
                event_ts: '100.1',
                ...overrides,
            },
        },
    };
}

describe('SlackAdapter', () => {
    it('validates bot identity without returning either credential', async () => {
        const authTest = vi.fn().mockResolvedValue({ ok: true, app_id: 'A123', user_id: 'U-BOT', team_id: 'T123', team: 'Sandbox' });
        await expect(validateSlackCredentials('xoxb-fake', { authTest })).resolves.toEqual({
            appId: 'A123', botUserId: 'U-BOT', workspaceId: 'T123', workspaceName: 'Sandbox',
        });
    });

    it('accepts Slack documented bot identity without an app ID', async () => {
        const authTest = vi.fn().mockResolvedValue({
            ok: true,
            bot_id: 'B123',
            user_id: 'U-BOT',
            team_id: 'T123',
            team: 'Sandbox',
        });
        await expect(validateSlackCredentials('xoxb-fake', { authTest })).resolves.toEqual({
            botUserId: 'U-BOT',
            workspaceId: 'T123',
            workspaceName: 'Sandbox',
        });
    });

    it('rejects incomplete Slack credential identity', async () => {
        const authTest = vi.fn().mockResolvedValue({ ok: true, team_id: 'T123' });
        await expect(validateSlackCredentials('xoxb-fake', { authTest })).rejects.toThrow('Slack bot token returned incomplete identity');
    });

    it('validates an app token through apps.connections.open', async () => {
        const open = vi.fn().mockResolvedValue({ ok: true, url: 'wss://wss-primary.slack.com/link/' });
        await expect(validateSlackAppToken('xapp-fake', { open })).resolves.toBeUndefined();
        expect(open).toHaveBeenCalledOnce();
    });

    it('rejects an app token that cannot open Socket Mode', async () => {
        const open = vi.fn().mockResolvedValue({ ok: false });
        await expect(validateSlackAppToken('xapp-fake', { open })).rejects.toThrow('Slack app token cannot open Socket Mode');
    });

    it('starts and stops the official Socket Mode client and reports health', async () => {
        const socket = new FakeSocketClient();
        const adapter = new SlackAdapter(config, { socketClient: socket, webClient: { chat: { postMessage: vi.fn() } } });
        expect(await adapter.isHealthy()).toBe(false);
        await adapter.start();
        expect(socket.start).toHaveBeenCalledOnce();
        expect(await adapter.isHealthy()).toBe(true);
        await adapter.stop();
        expect(socket.disconnect).toHaveBeenCalledOnce();
        expect(await adapter.isHealthy()).toBe(false);
    });

    it('does not register duplicate listeners across restarts', async () => {
        const socket = new FakeSocketClient();
        const adapter = new SlackAdapter(config, { socketClient: socket, webClient: { chat: { postMessage: vi.fn() } } });
        await adapter.start();
        await adapter.stop();
        await adapter.start();
        expect(socket.listenerCount('slack_event')).toBe(1);
        expect(socket.listenerCount('interactive')).toBe(1);
        socket.emit('disconnected');
        expect(await adapter.isHealthy()).toBe(false);
        socket.emit('connected');
        expect(await adapter.isHealthy()).toBe(true);
    });

    it('acknowledges before delivering one normalized workspace DM event', async () => {
        const socket = new FakeSocketClient();
        const adapter = new SlackAdapter(config, { socketClient: socket, webClient: { chat: { postMessage: vi.fn() } } });
        const order: string[] = [];
        adapter.onMessage(vi.fn(async (message) => {
            order.push('handler');
            expect(message).toMatchObject({
                channelType: 'slack', chatId: 'D123', userId: 'U123', workspaceId: 'T123', messageId: 'Ev123', text: 'run tests',
            });
        }));
        await adapter.start();
        const item = envelope();
        item.ack.mockImplementation(async () => { order.push('ack'); });
        socket.emit('slack_event', item);
        await vi.waitFor(() => expect(order).toEqual(['ack', 'handler']));
        socket.emit('slack_event', item);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(order).toEqual(['ack', 'handler', 'ack']);
    });

    it.each([
        ['wrong workspace', {}, { team_id: 'T999' }],
        ['bot message', { bot_id: 'B123' }, {}],
        ['self message', { user: 'U-BOT' }, {}],
        ['subtype', { subtype: 'message_changed' }, {}],
        ['non-DM', { channel_type: 'channel' }, {}],
    ])('ignores %s events', async (_name, eventOverrides, bodyOverrides) => {
        const socket = new FakeSocketClient();
        const handler = vi.fn();
        const adapter = new SlackAdapter(config, { socketClient: socket, webClient: { chat: { postMessage: vi.fn() } } });
        adapter.onMessage(handler);
        await adapter.start();
        const item = envelope(eventOverrides);
        Object.assign(item.body, bodyOverrides);
        socket.emit('slack_event', item);
        await vi.waitFor(() => expect(item.ack).toHaveBeenCalled());
        expect(handler).not.toHaveBeenCalled();
    });

    it('delivers an ordinary workspace DM immediately without pairing', async () => {
        const socket = new FakeSocketClient();
        const handler = vi.fn();
        const adapter = new SlackAdapter(config, {
            socketClient: socket,
            webClient: { chat: { postMessage: vi.fn() } },
        });
        adapter.onMessage(handler);
        await adapter.start();

        socket.emit('slack_event', envelope({ text: 'run tests' }));

        await vi.waitFor(() => expect(handler).toHaveBeenCalledWith(expect.objectContaining({
            chatId: 'D123', userId: 'U123', text: 'run tests', workspaceId: 'T123',
        })));
    });

    it('sends an accessible Block Kit question and finalizes its actions', async () => {
        const socket = new FakeSocketClient();
        const postMessage = vi.fn().mockResolvedValue({ ok: true, ts: '400.1' });
        const update = vi.fn().mockResolvedValue({ ok: true });
        const adapter = new SlackAdapter(config, { socketClient: socket, webClient: { chat: { postMessage, update } } });
        await expect(adapter.sendQuestion('D123', {
            id: 'q1', header: 'Scope', question: 'Choose one', allowSkip: true,
            options: [{ label: 'Safe', description: 'Read only', value: '1' }],
        })).resolves.toEqual({ messageId: '400.1' });
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
            channel: 'D123', text: 'Scope: Choose one', blocks: expect.any(Array),
        }));
        await adapter.finalizeInteraction('D123', '400.1');
        expect(update).toHaveBeenCalledWith({ channel: 'D123', ts: '400.1', blocks: [] });
    });

    it('escapes Slack control syntax in question fallback text', async () => {
        const postMessage = vi.fn().mockResolvedValue({ ok: true, ts: '400.1' });
        const adapter = new SlackAdapter(config, {
            socketClient: new FakeSocketClient(),
            webClient: { chat: { postMessage } },
        });
        await adapter.sendQuestion('D123', {
            id: 'q1', header: '<!channel>', question: 'Choose <one> & continue', allowSkip: false,
            options: [{ label: 'Safe', value: '1' }],
        });
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
            text: '&lt;!channel&gt;: Choose &lt;one&gt; &amp; continue',
        }));
    });

    it('acknowledges and delivers one valid workspace block action', async () => {
        const socket = new FakeSocketClient();
        const handler = vi.fn();
        const adapter = new SlackAdapter(config, { socketClient: socket, webClient: { chat: { postMessage: vi.fn() } } });
        adapter.onInteraction(handler);
        await adapter.start();
        const item = {
            ack: vi.fn().mockResolvedValue(undefined),
            body: {
                type: 'block_actions', team: { id: 'T123' }, user: { id: 'U123' },
                channel: { id: 'D123' }, container: { message_ts: '400.1' },
                actions: [{ action_id: 'ai_devkit_question', action_ts: '401.1', value: 'q1:1' }],
            },
        };
        socket.emit('interactive', item);
        await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
        expect(item.ack).toHaveBeenCalledOnce();
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({
            workspaceId: 'T123', chatId: 'D123', userId: 'U123', messageId: '400.1', value: 'q1:1',
        }));
        socket.emit('interactive', item);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(handler).toHaveBeenCalledOnce();
        expect(item.ack).toHaveBeenCalledTimes(2);
    });

    it('does not acknowledge interactive envelopes a second time on the generic event stream', async () => {
        const socket = new FakeSocketClient();
        const adapter = new SlackAdapter(config, { socketClient: socket, webClient: { chat: { postMessage: vi.fn() } } });
        await adapter.start();
        const ack = vi.fn().mockResolvedValue(undefined);
        socket.emit('slack_event', { type: 'interactive', ack, body: {} });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(ack).not.toHaveBeenCalled();
    });

    it('acknowledges malformed and wrong-workspace block actions without delivery', async () => {
        const socket = new FakeSocketClient();
        const handler = vi.fn();
        const adapter = new SlackAdapter(config, { socketClient: socket, webClient: { chat: { postMessage: vi.fn() } } });
        adapter.onInteraction(handler);
        await adapter.start();
        const ack = vi.fn().mockResolvedValue(undefined);
        socket.emit('interactive', { ack, body: { type: 'block_actions', team: { id: 'T999' }, actions: [] } });
        await vi.waitFor(() => expect(ack).toHaveBeenCalled());
        expect(handler).not.toHaveBeenCalled();
    });
});
