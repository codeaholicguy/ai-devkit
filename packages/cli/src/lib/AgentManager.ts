/**
 * Agent Manager
 * 
 * Orchestrates agent detection across multiple adapter types.
 * Manages adapter registration and aggregates results from all adapters.
 */

import type { AgentAdapter, AgentInfo } from './adapters/AgentAdapter';
import { AgentStatus } from './adapters/AgentAdapter';

/**
 * Agent Manager Class
 * 
 * Central manager for detecting AI agents across different types.
 * Supports multiple adapters (Claude Code, Gemini CLI, etc.)
 * 
 * @example
 * ```typescript
 * const manager = new AgentManager();
 * manager.registerAdapter(new ClaudeCodeAdapter());
 * 
 * const agents = await manager.listAgents();
 * console.log(`Found ${agents.length} agents`);
 * ```
 */
export class AgentManager {
    private adapters: Map<string, AgentAdapter> = new Map();

    /**
     * Register an adapter for a specific agent type
     * 
     * @param adapter Agent adapter to register
     * @throws Error if an adapter for this type is already registered
     * 
     * @example
     * ```typescript
     * manager.registerAdapter(new ClaudeCodeAdapter());
     * ```
     */
    registerAdapter(adapter: AgentAdapter): void {
        const adapterKey = adapter.type;

        if (this.adapters.has(adapterKey)) {
            throw new Error(`Adapter for type "${adapterKey}" is already registered`);
        }

        this.adapters.set(adapterKey, adapter);
    }

    /**
     * Unregister an adapter by type
     * 
     * @param type Agent type to unregister
     * @returns True if adapter was removed, false if not found
     */
    unregisterAdapter(type: string): boolean {
        return this.adapters.delete(type);
    }

    /**
     * Get all registered adapters
     * 
     * @returns Array of registered adapters
     */
    getAdapters(): AgentAdapter[] {
        return Array.from(this.adapters.values());
    }

    /**
     * Check if an adapter is registered for a specific type
     * 
     * @param type Agent type to check
     * @returns True if adapter is registered
     */
    hasAdapter(type: string): boolean {
        return this.adapters.has(type);
    }

    /**
     * List all running AI agents detected by registered adapters
     * 
     * Queries all registered adapters and aggregates results.
     * Handles errors gracefully - if one adapter fails, others still run.
     * 
     * @returns Array of detected agents from all adapters
     * 
     * @example
     * ```typescript
     * const agents = await manager.listAgents();
     * 
     * agents.forEach(agent => {
     *   console.log(`${agent.name}: ${agent.status}`);
     * });
     * ```
     */
    async listAgents(): Promise<AgentInfo[]> {
        const allAgents: AgentInfo[] = [];
        const errors: Array<{ type: string; error: Error }> = [];

        // Query all adapters in parallel
        const adapterPromises = Array.from(this.adapters.values()).map(async (adapter) => {
            try {
                const agents = await adapter.detectAgents();
                return { type: adapter.type, agents, error: null };
            } catch (error) {
                // Capture error but don't throw - allow other adapters to continue
                const err = error instanceof Error ? error : new Error(String(error));
                errors.push({ type: adapter.type, error: err });
                return { type: adapter.type, agents: [], error: err };
            }
        });

        const results = await Promise.all(adapterPromises);

        // Aggregate all successful results
        for (const result of results) {
            if (result.error === null) {
                allAgents.push(...result.agents);
            }
        }

        // Log errors if any (but don't throw - partial results are useful)
        if (errors.length > 0) {
            console.error(`Warning: ${errors.length} adapter(s) failed:`);
            errors.forEach(({ type, error }) => {
                console.error(`  - ${type}: ${error.message}`);
            });
        }

        // Sort by status priority (waiting first, then running, then idle)
        return this.sortAgentsByStatus(allAgents);
    }

    /**
     * Sort agents by status priority
     * 
     * Priority order: waiting > running > idle > unknown
     * This ensures agents that need attention appear first.
     * 
     * @param agents Array of agents to sort
     * @returns Sorted array of agents
     */
    private sortAgentsByStatus(agents: AgentInfo[]): AgentInfo[] {
        const statusPriority: Record<AgentStatus, number> = {
            [AgentStatus.WAITING]: 0,
            [AgentStatus.RUNNING]: 1,
            [AgentStatus.IDLE]: 2,
            [AgentStatus.UNKNOWN]: 3,
        };

        return agents.sort((a, b) => {
            const priorityA = statusPriority[a.status] ?? 999;
            const priorityB = statusPriority[b.status] ?? 999;
            return priorityA - priorityB;
        });
    }

    /**
     * Get count of registered adapters
     * 
     * @returns Number of registered adapters
     */
    getAdapterCount(): number {
        return this.adapters.size;
    }

    /**
     * Clear all registered adapters
     */
    clear(): void {
        this.adapters.clear();
    }

    /**
     * Resolve an agent by name (exact or partial match)
     * 
     * @param input Name to search for
     * @param agents List of agents to search within
     * @returns Matched agent (unique), array of agents (ambiguous), or null (none)
     */
    resolveAgent(input: string, agents: AgentInfo[]): AgentInfo | AgentInfo[] | null {
        if (!input || agents.length === 0) return null;

        const lowerInput = input.toLowerCase();

        // 1. Exact match (case-insensitive)
        const exactMatch = agents.find(a => a.name.toLowerCase() === lowerInput);
        if (exactMatch) return exactMatch;

        // 2. Partial match (prefix or contains)
        const matches = agents.filter(a => a.name.toLowerCase().includes(lowerInput));

        if (matches.length === 1) return matches[0];
        if (matches.length > 1) return matches;

        return null;
    }
}
