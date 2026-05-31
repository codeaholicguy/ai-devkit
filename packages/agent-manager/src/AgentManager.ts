/**
 * Agent Manager
 * 
 * Orchestrates agent detection across multiple adapter types.
 * Manages adapter registration and aggregates results from all adapters.
 */

import type {
    AgentAdapter,
    AgentInfo,
    SessionSummary,
    ListSessionsOptions,
} from './adapters/AgentAdapter.js';
import { sortAgents, type AgentSortKey } from './utils/sortAgents.js';
import { AgentRegistry, type RegistryEntry } from './utils/AgentRegistry.js';

export interface ListAgentsOptions {
    /**
     * Sort key for the returned list. Defaults to `status`, which orders
     * waiting → running → idle → unknown, then by name for stability.
     */
    sortBy?: AgentSortKey;
}

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
    private registry: AgentRegistry;

    constructor(registry: AgentRegistry = AgentRegistry.default()) {
        this.registry = registry;
    }

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
     * Get a registered adapter by type
     *
     * @param type Agent type to look up
     * @returns The adapter, or undefined if not registered
     */
    getAdapter(type: string): AgentAdapter | undefined {
        return this.adapters.get(type);
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
    async listAgents(options?: ListAgentsOptions): Promise<AgentInfo[]> {
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

        const preExistingByPid = new Map(this.registry.list().map((e) => [e.pid, e]));
        const entries = allAgents.map((agent) =>
            this.toRegistryEntry(agent, preExistingByPid.get(agent.pid)),
        );
        if (entries.length > 0) this.registry.registerBatch(entries);
        this.registry.prune();

        for (const agent of allAgents) {
            const entry = preExistingByPid.get(agent.pid);
            if (entry) {
                agent.name = entry.name;
            }
        }

        const sortKey: AgentSortKey = options?.sortBy ?? 'status';
        return sortAgents(allAgents, sortKey);
    }

    private toRegistryEntry(agent: AgentInfo, existing?: RegistryEntry): RegistryEntry {
        return {
            name: existing?.name ?? agent.name,
            type: agent.type,
            pid: agent.pid,
            tmuxSession: existing?.tmuxSession ?? '',
            cwd: agent.projectPath,
            startedAt: existing?.startedAt ?? new Date().toISOString(),
            sessionId: agent.sessionId,
            sessionFilePath: agent.sessionFilePath ?? '',
        };
    }

    /**
     * List historical sessions across every registered adapter.
     *
     * When `opts.type` is set, adapters whose `type` doesn't match are
     * skipped without being called. The remaining adapters' results are
     * merged and sorted by `lastActive` descending. Adapter failures are
     * caught (one-line stderr warning) so one broken adapter doesn't hide
     * the others.
     *
     * @param opts Filter options computed by the CLI; the manager passes
     *   them through to each adapter unchanged.
     */
    async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
        const targetAdapters = Array.from(this.adapters.values()).filter(
            (adapter) => opts?.type === undefined || adapter.type === opts.type,
        );

        const errors: Array<{ type: string; error: Error }> = [];

        const results = await Promise.all(
            targetAdapters.map(async (adapter) => {
                try {
                    return await adapter.listSessions(opts);
                } catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    errors.push({ type: adapter.type, error: err });
                    return [];
                }
            }),
        );

        if (errors.length > 0) {
            console.error(`Warning: ${errors.length} adapter(s) failed to list sessions:`);
            for (const { type, error } of errors) {
                console.error(`  - ${type}: ${error.message}`);
            }
        }

        const merged: SessionSummary[] = [];
        for (const list of results) {
            merged.push(...list);
        }

        merged.sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
        return merged;
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

        // Registry-first: if name is in registry and its PID is in the agent list, return it
        const registryEntry = this.registry.lookup(input);
        if (registryEntry) {
            const registryAgent = agents.find((a) => a.pid === registryEntry.pid);
            if (registryAgent) return registryAgent;
        }

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
