import { SlackDeliveryQueue } from '../../utils/SlackDeliveryQueue.js';

describe('SlackDeliveryQueue', () => {
    it('serializes long output as a parent followed by threaded continuations', async () => {
        const postMessage = vi.fn()
            .mockResolvedValueOnce({ ok: true, ts: '100.1' })
            .mockResolvedValue({ ok: true, ts: '100.2' });
        const queue = new SlackDeliveryQueue({ postMessage }, { maxMessageLength: 20 });
        const result = await queue.send('D123', 'first paragraph\n\nsecond paragraph that is long');
        expect(result).toEqual({ messageId: '100.1', threadId: '100.1' });
        expect(postMessage).toHaveBeenCalledTimes(3);
        expect(postMessage.mock.calls[0][0]).not.toHaveProperty('thread_ts');
        expect(postMessage.mock.calls[1][0]).toMatchObject({ channel: 'D123', thread_ts: '100.1' });
        expect(postMessage.mock.calls[2][0]).toMatchObject({ channel: 'D123', thread_ts: '100.1' });
    });

    it('waits for retryAfter before retrying a rate-limited API call', async () => {
        const error = Object.assign(new Error('rate limited'), { retryAfter: 2 });
        const postMessage = vi.fn().mockRejectedValueOnce(error).mockResolvedValue({ ok: true, ts: '200.1' });
        const sleep = vi.fn().mockResolvedValue(undefined);
        const queue = new SlackDeliveryQueue({ postMessage }, { sleep });
        await expect(queue.send('D123', 'hello')).resolves.toEqual({ messageId: '200.1', threadId: '200.1' });
        expect(sleep).toHaveBeenCalledWith(2000);
        expect(postMessage).toHaveBeenCalledTimes(2);
    });

    it('caps an excessive rate-limit delay', async () => {
        const error = Object.assign(new Error('rate limited'), { retryAfter: 86_400 });
        const postMessage = vi.fn().mockRejectedValueOnce(error).mockResolvedValue({ ok: true, ts: '200.1' });
        const sleep = vi.fn().mockResolvedValue(undefined);
        const queue = new SlackDeliveryQueue({ postMessage }, { sleep });
        await queue.send('D123', 'hello');
        expect(sleep).toHaveBeenCalledWith(60_000);
    });

    it('rejects overflow while a conversation send is pending', async () => {
        let release!: () => void;
        const pending = new Promise<{ ok: true; ts: string }>((resolve) => {
            release = () => resolve({ ok: true, ts: '300.1' });
        });
        const postMessage = vi.fn().mockReturnValue(pending);
        const queue = new SlackDeliveryQueue({ postMessage }, { maxQueueSize: 1 });
        const first = queue.send('D123', 'first');
        await expect(queue.send('D123', 'second')).rejects.toThrow('Slack delivery queue is full');
        release();
        await first;
    });

    it('rejects empty output and responses without a timestamp', async () => {
        const postMessage = vi.fn().mockResolvedValue({ ok: true });
        const queue = new SlackDeliveryQueue({ postMessage });
        await expect(queue.send('D123', '')).rejects.toThrow('Cannot send an empty Slack message');
        await expect(queue.send('D123', 'hello')).rejects.toThrow('Slack did not return a message timestamp');
    });

    it('propagates permanent and invalid rate-limit errors without sleeping', async () => {
        const sleep = vi.fn();
        const permanent = new Error('invalid_auth');
        const postMessage = vi.fn().mockRejectedValue(permanent);
        const queue = new SlackDeliveryQueue({ postMessage }, { sleep });
        await expect(queue.send('D123', 'hello')).rejects.toBe(permanent);
        expect(sleep).not.toHaveBeenCalled();
    });

    it('allows separate conversation queues to progress independently', async () => {
        const postMessage = vi.fn().mockImplementation(async ({ channel }) => ({ ok: true, ts: `${channel}.1` }));
        const queue = new SlackDeliveryQueue({ postMessage });
        await expect(Promise.all([queue.send('D1', 'one'), queue.send('D2', 'two')])).resolves.toHaveLength(2);
        expect(postMessage).toHaveBeenCalledTimes(2);
    });
});
