import type { ChannelAdapter } from './adapters/ChannelAdapter';

/**
 * Central registry for channel adapters.
 * Manages adapter lifecycle (start/stop).
 */
export class ChannelManager {
    private adapters: Map<string, ChannelAdapter> = new Map();

    /**
     * Register a channel adapter.
     * @throws If an adapter for the same type is already registered.
     */
    registerAdapter(adapter: ChannelAdapter): void {
        if (this.adapters.has(adapter.type)) {
            throw new Error(`Adapter for type "${adapter.type}" is already registered`);
        }
        this.adapters.set(adapter.type, adapter);
    }

    /**
     * Get a registered adapter by type.
     */
    getAdapter(type: string): ChannelAdapter | undefined {
        return this.adapters.get(type);
    }

    /**
     * Start all registered adapters.
     */
    async startAll(): Promise<void> {
        const startPromises = Array.from(this.adapters.values()).map(a => a.start());
        await Promise.all(startPromises);
    }

    /**
     * Stop all registered adapters.
     */
    async stopAll(): Promise<void> {
        const stopPromises = Array.from(this.adapters.values()).map(a => a.stop());
        await Promise.all(stopPromises);
    }
}
