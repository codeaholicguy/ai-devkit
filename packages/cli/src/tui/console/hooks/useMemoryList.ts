import { useEffect, useState } from 'react';
import { memoryListCommand } from '@ai-devkit/memory';
import type { KnowledgeItem, MemoryListOptions, ListKnowledgeResult } from '@ai-devkit/memory';
import { ConfigManager } from '../../../lib/Config.js';
import { getErrorMessage } from '../../../util/text.js';
import type { ConsoleMemoryItem, MemoryListState } from '../types.js';

const DEFAULT_MEMORY_LIMIT = 20;

export interface LoadMemoryListDeps {
    getMemoryDbPath: () => Promise<string | undefined>;
    memoryListCommand: (options: MemoryListOptions) => ListKnowledgeResult;
}

export interface LoadedMemoryList {
    items: ConsoleMemoryItem[];
    total: number;
}

function toConsoleMemoryItem(item: KnowledgeItem): ConsoleMemoryItem {
    return {
        id: item.id,
        title: item.title,
        scope: item.scope,
        tags: item.tags,
        updatedAt: item.updatedAt,
    };
}

export async function loadMemoryList(deps: LoadMemoryListDeps): Promise<LoadedMemoryList> {
    const dbPath = await deps.getMemoryDbPath();
    const result = deps.memoryListCommand({
        dbPath,
        limit: DEFAULT_MEMORY_LIMIT,
        sort: 'updated-desc',
    });

    return {
        items: result.items.map(toConsoleMemoryItem),
        total: result.total,
    };
}

export function useMemoryList(): MemoryListState {
    const [state, setState] = useState<MemoryListState>({
        items: [],
        total: 0,
        isLoading: true,
        error: null,
        lastUpdated: null,
    });

    useEffect(() => {
        let active = true;
        setState(current => ({
            ...current,
            isLoading: true,
            error: null,
        }));

        const configManager = new ConfigManager();
        void loadMemoryList({
            getMemoryDbPath: () => configManager.getMemoryDbPath(),
            memoryListCommand,
        }).then(result => {
            if (!active) return;
            setState({
                items: result.items,
                total: result.total,
                isLoading: false,
                error: null,
                lastUpdated: new Date(),
            });
        }).catch(error => {
            if (!active) return;
            setState(current => ({
                ...current,
                isLoading: false,
                error: getErrorMessage(error),
                lastUpdated: new Date(),
            }));
        });

        return () => {
            active = false;
        };
    }, []);

    return state;
}
