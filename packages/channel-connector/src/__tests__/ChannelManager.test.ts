import { ChannelManager } from '../ChannelManager';
import type { ChannelAdapter } from '../adapters/ChannelAdapter';

function createMockAdapter(type: string): jest.Mocked<ChannelAdapter> {
    return {
        type,
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        sendMessage: jest.fn().mockResolvedValue(undefined),
        onMessage: jest.fn(),
        isHealthy: jest.fn().mockResolvedValue(true),
    };
}

describe('ChannelManager', () => {
    let manager: ChannelManager;

    beforeEach(() => {
        manager = new ChannelManager();
    });

    describe('registerAdapter', () => {
        it('should register an adapter', () => {
            const adapter = createMockAdapter('telegram');
            manager.registerAdapter(adapter);
            expect(manager.getAdapter('telegram')).toBe(adapter);
        });

        it('should throw on duplicate adapter type', () => {
            const adapter1 = createMockAdapter('telegram');
            const adapter2 = createMockAdapter('telegram');
            manager.registerAdapter(adapter1);
            expect(() => manager.registerAdapter(adapter2)).toThrow(
                'Adapter for type "telegram" is already registered'
            );
        });
    });

    describe('getAdapter', () => {
        it('should return undefined for unregistered type', () => {
            expect(manager.getAdapter('slack')).toBeUndefined();
        });

        it('should return the registered adapter', () => {
            const adapter = createMockAdapter('telegram');
            manager.registerAdapter(adapter);
            expect(manager.getAdapter('telegram')).toBe(adapter);
        });
    });

    describe('startAll', () => {
        it('should call start() on all registered adapters', async () => {
            const telegram = createMockAdapter('telegram');
            const slack = createMockAdapter('slack');
            manager.registerAdapter(telegram);
            manager.registerAdapter(slack);

            await manager.startAll();

            expect(telegram.start).toHaveBeenCalledTimes(1);
            expect(slack.start).toHaveBeenCalledTimes(1);
        });

        it('should work with no adapters', async () => {
            await expect(manager.startAll()).resolves.toBeUndefined();
        });
    });

    describe('stopAll', () => {
        it('should call stop() on all registered adapters', async () => {
            const telegram = createMockAdapter('telegram');
            const slack = createMockAdapter('slack');
            manager.registerAdapter(telegram);
            manager.registerAdapter(slack);

            await manager.stopAll();

            expect(telegram.stop).toHaveBeenCalledTimes(1);
            expect(slack.stop).toHaveBeenCalledTimes(1);
        });

        it('should work with no adapters', async () => {
            await expect(manager.stopAll()).resolves.toBeUndefined();
        });
    });
});
