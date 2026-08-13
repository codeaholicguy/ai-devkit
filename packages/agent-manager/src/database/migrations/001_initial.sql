CREATE TABLE IF NOT EXISTS agents (
    type TEXT NOT NULL,
    pid INTEGER NOT NULL,
    name TEXT NOT NULL UNIQUE,
    tmux_session TEXT NOT NULL DEFAULT '',
    cwd TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL,
    session_id TEXT NOT NULL DEFAULT '',
    session_file_path TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (type, pid)
);
