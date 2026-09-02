import {
    getKnowledgeSummary,
    listKnowledge,
    storeKnowledge,
    updateKnowledge,
} from './services/knowledge.service.js';
import { searchKnowledge } from './services/search.service.js';
import {
    downloadSemanticModel,
    getSemanticStatus,
    reembedKnowledge,
    searchKnowledgeHybrid,
    storeKnowledgeSemantic,
    updateKnowledgeSemantic,
} from './services/semantic.service.js';
import { closeDatabase, getDatabase } from './database/index.js';
import type { StoreKnowledgeInput, SearchKnowledgeInput, StoreKnowledgeResult, SearchKnowledgeResult, UpdateKnowledgeInput, UpdateKnowledgeResult, ListKnowledgeInput, ListKnowledgeResult, ListKnowledgeSort, KnowledgeSummaryResult, KnowledgeItem } from './domain/knowledge/types.js';
import type { ReembedResult, SemanticStatusResult } from './services/semantic.service.js';

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
    return withMemoryDatabase(options.dbPath, () => storeKnowledge(toStoreInput(options)));
}

export function memoryUpdateCommand(options: MemoryUpdateOptions): UpdateKnowledgeResult {
    return withMemoryDatabase(options.dbPath, () => updateKnowledge(toUpdateInput(options)));
}

export function memorySearchCommand(options: MemorySearchOptions): SearchKnowledgeResult {
    return withMemoryDatabase(options.dbPath, () => searchKnowledge(toSearchInput(options, { includeExplain: false })));
}

export async function memorySearchCommandAsync(options: MemorySearchOptions): Promise<SearchKnowledgeResult> {
    return withMemoryDatabaseAsync(options.dbPath, async () => {
        const input = toSearchInput(options, { includeExplain: true });
        return options.semantic ? await searchKnowledgeHybrid(input) : searchKnowledge(input);
    });
}

export async function memoryStoreCommandAsync(options: MemoryStoreOptions & { semantic?: boolean }): Promise<StoreKnowledgeResult> {
    return withMemoryDatabaseAsync(options.dbPath, async () => {
        const input = toStoreInput(options);
        return options.semantic ? await storeKnowledgeSemantic(input) : storeKnowledge(input);
    });
}

export async function memoryUpdateCommandAsync(options: MemoryUpdateOptions & { semantic?: boolean }): Promise<UpdateKnowledgeResult> {
    return withMemoryDatabaseAsync(options.dbPath, async () => {
        const input = toUpdateInput(options);
        return options.semantic ? await updateKnowledgeSemantic(input) : updateKnowledge(input);
    });
}

export async function memorySemanticStatusCommand(options: MemorySemanticOptions = {}): Promise<SemanticStatusResult> {
    return withMemoryDatabaseAsync(options.dbPath, () => getSemanticStatus());
}

export async function memoryDownloadSemanticCommand(options: MemorySemanticOptions = {}): Promise<SemanticStatusResult> {
    return withMemoryDatabaseAsync(options.dbPath, () => downloadSemanticModel());
}

export async function memoryReembedCommand(options: MemoryReembedOptions = {}): Promise<ReembedResult> {
    return withMemoryDatabaseAsync(options.dbPath, () => reembedKnowledge({ force: options.force }));
}

export function memoryListCommand(options: MemoryListOptions = {}): ListKnowledgeResult {
    return withMemoryDatabase(options.dbPath, () => listKnowledge(toListInput(options)));
}

export function memorySummaryCommand(options: MemorySummaryOptions = {}): KnowledgeSummaryResult {
    return withMemoryDatabase(options.dbPath, () => getKnowledgeSummary());
}

function withMemoryDatabase<T>(dbPath: string | undefined, action: () => T): T {
    try {
        getDatabase({ dbPath });
        return action();
    } finally {
        closeDatabase();
    }
}

async function withMemoryDatabaseAsync<T>(dbPath: string | undefined, action: () => Promise<T>): Promise<T> {
    try {
        getDatabase({ dbPath });
        return await action();
    } finally {
        closeDatabase();
    }
}

function toStoreInput(options: MemoryStoreOptions): StoreKnowledgeInput {
    return {
        title: options.title,
        content: options.content,
        tags: parseCsvTags(options.tags),
        scope: options.scope,
    };
}

function toUpdateInput(options: MemoryUpdateOptions): UpdateKnowledgeInput {
    return {
        id: options.id,
        title: options.title,
        content: options.content,
        tags: parseCsvTags(options.tags),
        scope: options.scope,
    };
}

function toSearchInput(
    options: MemorySearchOptions,
    behavior: { includeExplain: boolean },
): SearchKnowledgeInput {
    return {
        query: options.query,
        contextTags: parseCsvTags(options.tags),
        scope: options.scope,
        limit: options.limit,
        ...(behavior.includeExplain ? { explain: options.explain } : {}),
    };
}

function toListInput(options: MemoryListOptions): ListKnowledgeInput {
    return {
        query: options.query,
        tags: parseCsvTags(options.tags),
        scope: options.scope,
        limit: options.limit,
        offset: options.offset,
        sort: options.sort,
    };
}

function parseCsvTags(tags: string | undefined): string[] | undefined {
    return tags ? tags.split(',').map(tag => tag.trim()) : undefined;
}
