import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';
import { validateStoreInput } from '../services/validator';
import { normalizeTitle, normalizeScope, normalizeTags, hashContent } from '../services/normalizer';
import { DuplicateError, StorageError } from '../utils/errors';
import type { StoreKnowledgeInput, StoreKnowledgeResult, KnowledgeRow } from '../types';

export function storeKnowledge(input: StoreKnowledgeInput): StoreKnowledgeResult {
    validateStoreInput(input);

    const db = getDatabase();
    const now = new Date().toISOString();
    const normalizedTitle = normalizeTitle(input.title);
    const scope = normalizeScope(input.scope);
    const tags = normalizeTags(input.tags ?? []);
    const contentHash = hashContent(input.content);
    const id = uuidv4();

    try {
        return db.transaction(() => {
            const existingByTitle = db.queryOne<KnowledgeRow>(
                'SELECT id FROM knowledge WHERE normalized_title = ? AND scope = ?',
                [normalizedTitle, scope]
            );

            if (existingByTitle) {
                throw new DuplicateError(
                    'Knowledge with similar title already exists in this scope',
                    existingByTitle.id,
                    'title'
                );
            }

            const existingByHash = db.queryOne<KnowledgeRow>(
                'SELECT id FROM knowledge WHERE content_hash = ? AND scope = ?',
                [contentHash, scope]
            );

            if (existingByHash) {
                throw new DuplicateError(
                    'Knowledge with identical content already exists in this scope',
                    existingByHash.id,
                    'content'
                );
            }

            db.execute(
                `INSERT INTO knowledge (
          id, title, content, tags, scope,
          normalized_title, content_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    input.title.trim(),
                    input.content.trim(),
                    JSON.stringify(tags),
                    scope,
                    normalizedTitle,
                    contentHash,
                    now,
                    now
                ]
            );

            return {
                success: true,
                id,
                message: 'Knowledge stored successfully'
            };
        });
    } catch (error) {
        if (error instanceof DuplicateError) {
            throw error;
        }
        throw new StorageError(
            'Failed to store knowledge',
            { originalError: error instanceof Error ? error.message : String(error) }
        );
    }
}