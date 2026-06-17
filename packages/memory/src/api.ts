import { storeKnowledge } from './handlers/store.js';
import { searchKnowledge } from './handlers/search.js';
import { updateKnowledge } from './handlers/update.js';
import { listKnowledge } from './handlers/list.js';
import { getKnowledgeSummary } from './handlers/summary.js';
import { closeDatabase, getDatabase } from './database/index.js';
import type { StoreKnowledgeInput, SearchKnowledgeInput, StoreKnowledgeResult, SearchKnowledgeResult, UpdateKnowledgeInput, UpdateKnowledgeResult, ListKnowledgeInput, ListKnowledgeResult, ListKnowledgeSort, KnowledgeSummaryResult, KnowledgeItem } from './types/index.js';

export { storeKnowledge, searchKnowledge, updateKnowledge, listKnowledge, getKnowledgeSummary };
export type { StoreKnowledgeInput, SearchKnowledgeInput, StoreKnowledgeResult, SearchKnowledgeResult, UpdateKnowledgeInput, UpdateKnowledgeResult, ListKnowledgeInput, ListKnowledgeResult, ListKnowledgeSort, KnowledgeSummaryResult, KnowledgeItem };

// CLI command handlers for integration with main ai-devkit CLI
export interface MemoryStoreOptions {
    title: string;
    content: string;
    tags?: string;
    scope?: string;
    dbPath?: string;
}

export interface MemoryUpdateOptions {
    id: string;
    title?: string;
    content?: string;
    tags?: string;
    scope?: string;
    dbPath?: string;
}

export interface MemorySearchOptions {
    query: string;
    tags?: string;
    scope?: string;
    limit?: number;
    dbPath?: string;
}

export interface MemoryListOptions {
    query?: string;
    tags?: string;
    scope?: string;
    limit?: number;
    offset?: number;
    sort?: ListKnowledgeSort;
    dbPath?: string;
}

export interface MemorySummaryOptions {
    dbPath?: string;
}

export function memoryStoreCommand(options: MemoryStoreOptions): StoreKnowledgeResult {
    try {
        getDatabase({ dbPath: options.dbPath });
        const input: StoreKnowledgeInput = {
            title: options.title,
            content: options.content,
            tags: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
            scope: options.scope,
        };

        return storeKnowledge(input);
    } finally {
        closeDatabase();
    }
}

export function memoryUpdateCommand(options: MemoryUpdateOptions): UpdateKnowledgeResult {
    try {
        getDatabase({ dbPath: options.dbPath });
        const input: UpdateKnowledgeInput = {
            id: options.id,
            title: options.title,
            content: options.content,
            tags: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
            scope: options.scope,
        };

        return updateKnowledge(input);
    } finally {
        closeDatabase();
    }
}

export function memorySearchCommand(options: MemorySearchOptions): SearchKnowledgeResult {
    try {
        getDatabase({ dbPath: options.dbPath });
        const input: SearchKnowledgeInput = {
            query: options.query,
            contextTags: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
            scope: options.scope,
            limit: options.limit,
        };

        return searchKnowledge(input);
    } finally {
        closeDatabase();
    }
}

export function memoryListCommand(options: MemoryListOptions = {}): ListKnowledgeResult {
    try {
        getDatabase({ dbPath: options.dbPath });
        const input: ListKnowledgeInput = {
            query: options.query,
            tags: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
            scope: options.scope,
            limit: options.limit,
            offset: options.offset,
            sort: options.sort,
        };

        return listKnowledge(input);
    } finally {
        closeDatabase();
    }
}

export function memorySummaryCommand(options: MemorySummaryOptions = {}): KnowledgeSummaryResult {
    try {
        getDatabase({ dbPath: options.dbPath });
        return getKnowledgeSummary();
    } finally {
        closeDatabase();
    }
}
