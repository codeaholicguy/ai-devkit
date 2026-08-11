CREATE TABLE durable_agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    provider TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'durable',
    cwd TEXT NOT NULL,
    provider_session_id TEXT NULL UNIQUE,
    state TEXT NOT NULL CHECK (state IN ('ready','running','degraded')),
    session_health TEXT NOT NULL CHECK (session_health IN ('uninitialized','healthy','unknown','mismatch')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_active_at TEXT NULL,
    last_result_status TEXT NULL CHECK (last_result_status IS NULL OR last_result_status IN ('succeeded','failed','interrupted')),
    last_result_completed_at TEXT NULL,
    last_result_exit_code INTEGER NULL,
    last_result_summary TEXT NULL,
    active_run_token TEXT UNIQUE,
    active_owner_pid INTEGER NULL,
    active_owner_started_at TEXT NULL,
    active_provider_pid INTEGER NULL,
    active_provider_started_at TEXT NULL,
    active_run_started_at TEXT NULL,
    CHECK (
        (state = 'running'
            AND active_run_token IS NOT NULL
            AND active_owner_pid IS NOT NULL
            AND active_owner_started_at IS NOT NULL
            AND active_run_started_at IS NOT NULL)
        OR
        (state <> 'running'
            AND active_run_token IS NULL
            AND active_owner_pid IS NULL
            AND active_owner_started_at IS NULL
            AND active_provider_pid IS NULL
            AND active_provider_started_at IS NULL
            AND active_run_started_at IS NULL)
    ),
    CHECK ((active_provider_pid IS NULL) = (active_provider_started_at IS NULL)),
    CHECK ((last_result_status IS NULL) = (last_result_completed_at IS NULL))
);

CREATE INDEX idx_durable_agents_state ON durable_agents(state);
CREATE INDEX idx_durable_agents_list ON durable_agents(updated_at DESC, name COLLATE NOCASE);
