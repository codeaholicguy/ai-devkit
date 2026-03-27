---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Code Structure

All changes are in `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`.

## Implementation Notes

### `tryPidFileMatching()`

No upfront directory check — each PID is always tried individually via try/catch.

```typescript
private tryPidFileMatching(processes: ProcessInfo[]): {
    direct: Array<{ process: ProcessInfo; sessionFile: SessionFile }>;
    fallback: ProcessInfo[];
} {
    const sessionsDir = path.join(os.homedir(), '.claude', 'sessions');
    const direct: Array<{ process: ProcessInfo; sessionFile: SessionFile }> = [];
    const fallback: ProcessInfo[] = [];

    for (const proc of processes) {
        const pidFilePath = path.join(sessionsDir, `${proc.pid}.json`);
        try {
            const raw = fs.readFileSync(pidFilePath, 'utf-8');
            const entry = JSON.parse(raw) as PidFileEntry;

            // Stale-file guard: reject if startedAt diverges from enriched proc.startTime by > 60 s
            if (proc.startTime) {
                const deltaMs = Math.abs(proc.startTime.getTime() - entry.startedAt);
                if (deltaMs > 60_000) {
                    fallback.push(proc);
                    continue;
                }
            }

            const projectDir = this.getProjectDir(entry.cwd);
            const jsonlPath = path.join(projectDir, `${entry.sessionId}.jsonl`);

            if (!fs.existsSync(jsonlPath)) {
                fallback.push(proc);
                continue;
            }

            const sessionFile: SessionFile = {
                sessionId: entry.sessionId,
                filePath: jsonlPath,
                projectDir,
                birthtimeMs: 0,          // not used for direct matches
                resolvedCwd: entry.cwd,
            };
            direct.push({ process: proc, sessionFile });
        } catch {
            // PID file absent, unreadable, or malformed → fall back per-process
            fallback.push(proc);
        }
    }

    return { direct, fallback };
}
```

### `detectAgents()` changes

After `enrichProcesses(processes)`:

1. Call `tryPidFileMatching(processes)` → `{ direct, fallback }`.
2. Run existing `discoverSessions(fallback)` + `matchProcessesToSessions(fallback, sessions)` only on `fallback`.
3. Merge `direct` matches and `legacyMatches` into a single list before iterating to build `AgentInfo`.

### `PidFileEntry` interface

Add near the top of `ClaudeCodeAdapter.ts`:

```typescript
interface PidFileEntry {
    pid: number;
    sessionId: string;
    cwd: string;
    startedAt: number;   // epoch milliseconds
    kind: string;
    entrypoint: string;
}
```

## Error Handling

- Any `fs.readFileSync` failure (file not found, permission denied) → catch → push to fallback.
- JSON parse failure → catch → push to fallback.
- `fs.existsSync` on JSONL → false → push to fallback.
