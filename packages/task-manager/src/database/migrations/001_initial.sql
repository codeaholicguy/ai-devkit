-- Migration 001: Initial schema
-- Stores task snapshots and an append-only event history in SQLite.

-- One row per task. `snapshot` holds the full Task JSON (preserves the logical
-- Task shape exactly); the indexed columns mirror queryable fields so the DB is
-- inspectable and ready for future repository-level filtering.
CREATE TABLE IF NOT EXISTS tasks (
    task_id TEXT PRIMARY KEY,
    snapshot TEXT NOT NULL,
    feature TEXT,
    status TEXT NOT NULL,
    phase TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_feature ON tasks(feature);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_phase ON tasks(phase);

-- Append-only event history: one row per event. `id` gives stable insertion
-- order (chronological append order); `event_id` is the unique natural key.
-- (No FK to tasks, mirroring @ai-devkit/memory's schema convention; task rows are
-- never deleted in MVP, so orphan events are not a concern.)
CREATE TABLE IF NOT EXISTS task_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    task_id TEXT NOT NULL,
    ts TEXT NOT NULL,
    type TEXT NOT NULL,
    actor TEXT,
    payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_task_events_type ON task_events(type);
