export interface KnowledgeItem {
    id: string;
    title: string;
    content: string;
    tags: string[];
    scope: string;
    normalizedTitle: string;
    contentHash: string;
    createdAt: string;
    updatedAt: string;
}

export type KnowledgeScope = 'global' | `project:${string}` | `repo:${string}`;

export interface StoreKnowledgeInput {
    title: string;
    content: string;
    tags?: string[];
    scope?: string;
}

export interface StoreKnowledgeResult {
    success: boolean;
    id?: string;
    message: string;
}

export interface UpdateKnowledgeInput {
    id: string;
    title?: string;
    content?: string;
    tags?: string[];
    scope?: string;
}

export interface UpdateKnowledgeResult {
    success: boolean;
    id: string;
    message: string;
}

export interface SearchKnowledgeInput {
    query: string;
    contextTags?: string[];
    scope?: string;
    limit?: number;
}

export interface SearchResultItem {
    id: string;
    title: string;
    content: string;
    tags: string[];
    scope: string;
    score: number;
}

export interface SearchKnowledgeResult {
    results: SearchResultItem[];
    totalMatches: number;
    query: string;
}

export interface KnowledgeRow {
    id: string;
    title: string;
    content: string;
    tags: string;
    scope: string;
    normalized_title: string;
    content_hash: string;
    created_at: string;
    updated_at: string;
}

export interface MetaRow {
    key: string;
    value: string;
}