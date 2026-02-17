import { getDatabase } from '../database';
import { validateUpdateInput } from '../services/validator';
import { normalizeTitle, normalizeScope, normalizeTags, hashContent } from '../services/normalizer';
import { DuplicateError, NotFoundError, StorageError } from '../utils/errors';
import type { UpdateKnowledgeInput, UpdateKnowledgeResult, KnowledgeRow } from '../types';

export function updateKnowledge(input: UpdateKnowledgeInput): UpdateKnowledgeResult {
    validateUpdateInput(input);

    const db = getDatabase();
    const now = new Date().toISOString();

    try {
        return db.transaction(() => {
            const existing = db.queryOne<KnowledgeRow>(
                'SELECT * FROM knowledge WHERE id = ?',
                [input.id]
            );

            if (!existing) {
                throw new NotFoundError(`Knowledge item not found: ${input.id}`, input.id);
            }

            const title = input.title !== undefined ? input.title.trim() : existing.title;
            const content = input.content !== undefined ? input.content.trim() : existing.content;
            const tags = input.tags !== undefined ? normalizeTags(input.tags) : JSON.parse(existing.tags);
            const scope = input.scope !== undefined ? normalizeScope(input.scope) : existing.scope;
            const normalizedTitle = normalizeTitle(title);
            const contentHash = hashContent(content);

            const existingByTitle = db.queryOne<KnowledgeRow>(
                'SELECT id FROM knowledge WHERE normalized_title = ? AND scope = ? AND id != ?',
                [normalizedTitle, scope, input.id]
            );

            if (existingByTitle) {
                throw new DuplicateError(
                    'Knowledge with similar title already exists in this scope',
                    existingByTitle.id,
                    'title'
                );
            }

            const existingByHash = db.queryOne<KnowledgeRow>(
                'SELECT id FROM knowledge WHERE content_hash = ? AND scope = ? AND id != ?',
                [contentHash, scope, input.id]
            );

            if (existingByHash) {
                throw new DuplicateError(
                    'Knowledge with identical content already exists in this scope',
                    existingByHash.id,
                    'content'
                );
            }

            db.execute(
                `UPDATE knowledge SET
                    title = ?, content = ?, tags = ?, scope = ?,
                    normalized_title = ?, content_hash = ?, updated_at = ?
                WHERE id = ?`,
                [
                    title,
                    content,
                    JSON.stringify(tags),
                    scope,
                    normalizedTitle,
                    contentHash,
                    now,
                    input.id
                ]
            );

            return {
                success: true,
                id: input.id,
                message: 'Knowledge updated successfully'
            };
        });
    } catch (error) {
        if (error instanceof DuplicateError || error instanceof NotFoundError) {
            throw error;
        }
        throw new StorageError(
            'Failed to update knowledge',
            { originalError: error instanceof Error ? error.message : String(error) }
        );
    }
}
