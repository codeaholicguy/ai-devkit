-- Migration 002: Optional semantic embeddings
-- Embeddings are nullable so migration and lexical search remain offline-safe.

ALTER TABLE knowledge ADD COLUMN embedding BLOB;
ALTER TABLE knowledge ADD COLUMN embedding_version TEXT;

CREATE INDEX IF NOT EXISTS idx_knowledge_embedding_version
ON knowledge(embedding_version);
