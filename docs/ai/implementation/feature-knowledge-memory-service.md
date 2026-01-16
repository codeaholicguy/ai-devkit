---
phase: implementation
title: Knowledge Memory Service - Implementation Guide
description: Technical implementation notes for the Knowledge Memory Service
---

# Implementation Guide

## Development Setup

### Prerequisites
- Node.js v18+, npm v9+
- Python 3 & C++ compiler (for better-sqlite3)

### Setup Steps
```bash
cd packages/knowledge-memory-service
npm install && npm run build && npm test
```

### Configuration
```bash
KNOWLEDGE_MEMORY_DB_PATH=~/.knowledge-memory/memory.db
LOG_LEVEL=info
```

## Code Structure

```
packages/knowledge-memory-service/
├── src/
│   ├── index.ts           # Entry point
│   ├── server.ts          # MCP server
│   ├── handlers/          # Tool handlers
│   ├── database/          # SQLite layer
│   ├── services/          # Business logic
│   ├── types/             # Interfaces
│   └── utils/             # Helpers
└── tests/
```

## Implementation Notes

### Database Connection
```typescript
import Database from 'better-sqlite3';

export class DatabaseConnection {
  private db: Database.Database;
  
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }
}
```

### FTS5 Search with BM25
```typescript
const searchQuery = `
  SELECT k.*, bm25(knowledge_fts, 10.0, 5.0, 1.0) as score
  FROM knowledge k
  JOIN knowledge_fts ON k.rowid = knowledge_fts.rowid
  WHERE knowledge_fts MATCH ?
  ORDER BY score LIMIT ?
`;
```

### Validation
- Title: 10-100 chars
- Content: 50-5000 chars, reject generic phrases
- Tags: 1-10 items, alphanumeric

## Error Handling

```typescript
export class ValidationError extends Error {
  constructor(message: string, public details: object) {
    super(message);
  }
}

export class DuplicateError extends Error {
  constructor(public existingId: string) {
    super('Duplicate detected');
  }
}
```

## Performance

- Prepared statements for all queries
- WAL mode for concurrent reads
- Indexed columns: scope, category, priority
- Default limit: 5, max: 20

## Security

- Parameterized queries (no SQL injection)
- Input validation on all fields
- Content length limits enforced
