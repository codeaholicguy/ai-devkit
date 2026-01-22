import { storeKnowledge } from './handlers/store';
import { searchKnowledge } from './handlers/search';
import type { StoreKnowledgeInput, SearchKnowledgeInput, StoreKnowledgeResult, SearchKnowledgeResult } from './types';

export { storeKnowledge, searchKnowledge };
export type { StoreKnowledgeInput, SearchKnowledgeInput, StoreKnowledgeResult, SearchKnowledgeResult };

// CLI command handlers for integration with main ai-devkit CLI
export interface MemoryStoreOptions {
    title: string;
    content: string;
    tags?: string;
    scope?: string;
}

export interface MemorySearchOptions {
    query: string;
    tags?: string;
    scope?: string;
    limit?: number;
}

export function memoryStoreCommand(options: MemoryStoreOptions): StoreKnowledgeResult {
    const input: StoreKnowledgeInput = {
        title: options.title,
        content: options.content,
        tags: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
        scope: options.scope,
    };

    return storeKnowledge(input);
}

export function memorySearchCommand(options: MemorySearchOptions): SearchKnowledgeResult {
    const input: SearchKnowledgeInput = {
        query: options.query,
        contextTags: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
        scope: options.scope,
        limit: options.limit,
    };

    return searchKnowledge(input);
}
