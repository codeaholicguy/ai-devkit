ALTER TABLE agents ADD COLUMN deleted_at TEXT;
CREATE INDEX idx_agents_identity ON agents(type, session_id);
