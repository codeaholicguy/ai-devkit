import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';
import { closeDatabase, getDatabase } from '../../src/database';
import { storeKnowledge } from '../../src/handlers/store';
import { updateKnowledge } from '../../src/handlers/update';
import { searchKnowledgeHybrid } from '../../src/handlers/semantic-search';
import { MODEL_VERSION } from '../../src/services/model';
import { serializeEmbedding } from '../../src/services/semantic';
import { SemanticModelUnavailableError, type LocalEmbedder } from '../../src/services/embedder';
import { getSemanticStatus, reembedKnowledge, storeKnowledgeSemantic } from '../../src/handlers/semantic-maintenance';

describe('semantic search integration', () => {
    const dbPath = join(tmpdir(), `semantic-search-${Date.now()}-${Math.random().toString(36)}.db`);
    const first = new Float32Array(384); first[0] = 1;
    const second = new Float32Array(384); second[1] = 1;
    const embedder: LocalEmbedder = {
        embed: async () => first,
        embedMany: async () => [first],
        dispose: async () => undefined,
    };

    beforeAll(() => getDatabase({ dbPath }));
    afterAll(() => {
        closeDatabase();
        rmSync(dbPath, { force: true });
        rmSync(`${dbPath}-wal`, { force: true });
        rmSync(`${dbPath}-shm`, { force: true });
    });

    beforeEach(() => getDatabase().execute('DELETE FROM knowledge'));

    function store(title: string, content: string) {
        const result = storeKnowledge({ title, content, tags: ['semantic'], scope: 'global' });
        return result.id!;
    }

    it('retrieves a semantic-only paraphrase and exposes explanations', async () => {
        const relevant = store('Response serialization boundary', 'Public HTTP payloads are mapped through dedicated transfer objects before leaving the service boundary.');
        const distractor = store('Queue retention policy rules', 'Failed queue messages remain available for seven days before automated cleanup removes them permanently.');
        const db = getDatabase();
        db.execute('UPDATE knowledge SET embedding = ?, embedding_version = ? WHERE id = ?', [serializeEmbedding(first), MODEL_VERSION, relevant]);
        db.execute('UPDATE knowledge SET embedding = ?, embedding_version = ? WHERE id = ?', [serializeEmbedding(second), MODEL_VERSION, distractor]);

        const result = await searchKnowledgeHybrid(
            { query: 'wire contracts', limit: 5, explain: true },
            { embedder },
        );

        expect(result.results[0]?.id).toBe(relevant);
        expect(result.retrievalMode).toBe('hybrid');
        expect(result.results[0]?.retrieval).toMatchObject({ lexicalRank: null, semanticRank: 1 });
        expect(result.semantic.status).toBe('ready');
    });

    it('degrades to lexical results when the local model is unavailable', async () => {
        const relevant = store('Exact retry policy identifier', 'The WEB-1842 retry rule applies exponential backoff only to transient server failures.');
        const unavailable: LocalEmbedder = {
            embed: async () => { throw new SemanticModelUnavailableError('offline'); },
            embedMany: async () => [],
            dispose: async () => undefined,
        };

        const result = await searchKnowledgeHybrid({ query: 'WEB-1842', limit: 5 }, { embedder: unavailable });

        expect(result.results[0]?.id).toBe(relevant);
        expect(result.retrievalMode).toBe('lexical');
        expect(result.semantic.status).toBe('unavailable');
    });

    it('invalidates embeddings for document changes but retains them for scope-only updates', () => {
        const id = store('Embedding invalidation behavior', 'Changing searchable memory text must invalidate its previously computed semantic embedding value.');
        const db = getDatabase();
        db.execute('UPDATE knowledge SET embedding = ?, embedding_version = ? WHERE id = ?', [serializeEmbedding(first), MODEL_VERSION, id]);

        updateKnowledge({ id, scope: 'project:memory' });
        expect(db.queryOne<{ embedding: Buffer | null }>('SELECT embedding FROM knowledge WHERE id = ?', [id])?.embedding).not.toBeNull();

        updateKnowledge({ id, tags: ['changed'] });
        expect(db.queryOne<{ embedding: Buffer | null; embedding_version: string | null }>(
            'SELECT embedding, embedding_version FROM knowledge WHERE id = ?', [id]
        )).toEqual({ embedding: null, embedding_version: null });
    });

    it('backfills missing embeddings and skips current rows on the next run', async () => {
        store('Missing semantic vector', 'This memory begins without an embedding and must be included by the resumable backfill operation.');
        store('Another missing vector', 'This second memory also needs a deterministic semantic vector written by the maintenance command.');

        const firstRun = await reembedKnowledge({ embedder, batchSize: 1 });
        const secondRun = await reembedKnowledge({ embedder, batchSize: 1 });
        const forcedRun = await reembedKnowledge({ embedder, batchSize: 1, force: true });

        expect(firstRun).toMatchObject({ embedded: 2, failed: 0, skipped: 0 });
        expect(secondRun).toMatchObject({ embedded: 0, failed: 0, skipped: 2 });
        expect(forcedRun).toMatchObject({ embedded: 2, failed: 0, skipped: 0 });
        expect(getDatabase().queryOne<{ count: number }>(
            'SELECT COUNT(*) AS count FROM knowledge WHERE embedding_version = ?', [MODEL_VERSION]
        )?.count).toBe(2);
    });

    it('stores an embedding with semantic-aware writes', async () => {
        const result = await storeKnowledgeSemantic({
            title: 'Semantic write behavior',
            content: 'Semantic-enabled stores write the searchable memory and its matching model vector in one database transaction.',
            tags: ['write'],
        }, { embedder });

        expect(getDatabase().queryOne<{ embedding: Buffer; embedding_version: string }>(
            'SELECT embedding, embedding_version FROM knowledge WHERE id = ?', [result.id]
        )).toMatchObject({ embedding_version: MODEL_VERSION });
    });

    it('reports model and embedding readiness without loading the runtime', async () => {
        store('Status missing vector', 'The status command reports memories that have not yet received a compatible semantic embedding value.');
        const status = await getSemanticStatus({ modelsRoot: join(tmpdir(), 'definitely-missing-model-root') });

        expect(status).toMatchObject({ modelReady: false, total: 1, current: 0, missing: 1, stale: 0 });
    });

    it('ignores corrupt vectors without losing lexical results', async () => {
        const relevant = store('Corrupt vector fallback', 'Lexical retrieval remains available when a stored semantic vector has an invalid byte length.');
        getDatabase().execute('UPDATE knowledge SET embedding = ?, embedding_version = ? WHERE id = ?', [Buffer.from([1, 2]), MODEL_VERSION, relevant]);

        const result = await searchKnowledgeHybrid({ query: 'corrupt vector fallback', limit: 5 }, { embedder });

        expect(result.results[0]?.id).toBe(relevant);
        expect(result.semantic).toMatchObject({ status: 'ready', eligibleCount: 0 });
    });

    it('skips semantic inference when the eligible corpus exceeds the scan limit', async () => {
        const db = getDatabase();
        const insert = db.instance.prepare(`INSERT INTO knowledge
            (id,title,content,tags,scope,normalized_title,content_hash,created_at,updated_at,embedding,embedding_version)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
        db.instance.transaction(() => {
            for (let index = 0; index < 5_001; index++) {
                insert.run(`large-${index}`, `Large corpus memory ${index}`, `Large corpus content ${index} contains enough searchable developer knowledge for validation.`, '[]', 'global', `large corpus memory ${index}`, `large-hash-${index}`, '2026-09-01', '2026-09-01', serializeEmbedding(first), MODEL_VERSION);
            }
        })();
        const neverCalled = vi.spyOn(embedder, 'embed');

        const result = await searchKnowledgeHybrid({ query: 'large corpus', limit: 5 }, { embedder });

        expect(result.semantic.status).toBe('corpus-too-large');
        expect(result.retrievalMode).toBe('lexical');
        expect(neverCalled).not.toHaveBeenCalled();
    });
});
