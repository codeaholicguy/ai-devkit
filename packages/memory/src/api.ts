import { storeKnowledge } from './handlers/store.js';
import { searchKnowledge } from './handlers/search.js';
import { updateKnowledge } from './handlers/update.js';
import { listKnowledge } from './handlers/list.js';
import { getKnowledgeSummary } from './handlers/summary.js';
import { searchKnowledgeHybrid } from './handlers/semantic-search.js';
import {
    downloadSemanticModel,
    getSemanticStatus,
    reembedKnowledge,
    storeKnowledgeSemantic,
    updateKnowledgeSemantic,
} from './handlers/semantic-maintenance.js';
import { closeDatabase, getDatabase } from './database/index.js';
import type { StoreKnowledgeInput, SearchKnowledgeInput, StoreKnowledgeResult, SearchKnowledgeResult, UpdateKnowledgeInput, UpdateKnowledgeResult, ListKnowledgeInput, ListKnowledgeResult, ListKnowledgeSort, KnowledgeSummaryResult, KnowledgeItem } from './types/index.js';
import type { ReembedResult, SemanticStatusResult } from './handlers/semantic-maintenance.js';

export { storeKnowledge, searchKnowledge, searchKnowledgeHybrid, updateKnowledge, listKnowledge, getKnowledgeSummary };
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
    semantic?: boolean;
    explain?: boolean;
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

export interface MemorySemanticOptions {
    dbPath?: string;
}

export interface MemoryReembedOptions extends MemorySemanticOptions {
    force?: boolean;
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

export async function memorySearchCommandAsync(options: MemorySearchOptions): Promise<SearchKnowledgeResult> {
    try {
        getDatabase({ dbPath: options.dbPath });
        const input: SearchKnowledgeInput = {
            query: options.query,
            contextTags: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
            scope: options.scope,
            limit: options.limit,
            explain: options.explain,
        };
        return options.semantic ? await searchKnowledgeHybrid(input) : searchKnowledge(input);
    } finally {
        closeDatabase();
    }
}

export async function memoryStoreCommandAsync(options: MemoryStoreOptions & { semantic?: boolean }): Promise<StoreKnowledgeResult> {
    try {
        getDatabase({ dbPath: options.dbPath });
        const input: StoreKnowledgeInput = {
            title: options.title,
            content: options.content,
            tags: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
            scope: options.scope,
        };
        return options.semantic ? await storeKnowledgeSemantic(input) : storeKnowledge(input);
    } finally {
        closeDatabase();
    }
}

export async function memoryUpdateCommandAsync(options: MemoryUpdateOptions & { semantic?: boolean }): Promise<UpdateKnowledgeResult> {
    try {
        getDatabase({ dbPath: options.dbPath });
        const input: UpdateKnowledgeInput = {
            id: options.id,
            title: options.title,
            content: options.content,
            tags: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
            scope: options.scope,
        };
        return options.semantic ? await updateKnowledgeSemantic(input) : updateKnowledge(input);
    } finally {
        closeDatabase();
    }
}

export async function memorySemanticStatusCommand(options: MemorySemanticOptions = {}): Promise<SemanticStatusResult> {
    try {
        getDatabase({ dbPath: options.dbPath });
        return await getSemanticStatus();
    } finally {
        closeDatabase();
    }
}

export async function memoryDownloadSemanticCommand(options: MemorySemanticOptions = {}): Promise<SemanticStatusResult> {
    try {
        getDatabase({ dbPath: options.dbPath });
        return await downloadSemanticModel();
    } finally {
        closeDatabase();
    }
}

export async function memoryReembedCommand(options: MemoryReembedOptions = {}): Promise<ReembedResult> {
    try {
        getDatabase({ dbPath: options.dbPath });
        return await reembedKnowledge({ force: options.force });
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
