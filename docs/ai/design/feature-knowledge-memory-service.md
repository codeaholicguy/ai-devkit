---
phase: design
title: Knowledge Memory Service - System Design & Architecture
description: Define the technical architecture, components, and data models for the Knowledge Memory Service
---

# System Design & Architecture

## Architecture Overview
**What is the high-level system structure?**

```mermaid
graph TD
    subgraph "AI Agent Environment"
        Agent[AI Agent]
    end
    
    subgraph "MCP Server"
        MCP[MCP stdio Interface]
        Store[Store Handler]
        Search[Search Handler]
        Validate[Validator]
        Rank[Ranker]
    end
    
    subgraph "Storage Layer"
        SQLite[(SQLite DB)]
        FTS[FTS5 Index]
    end
    
    Agent -->|memory.storeKnowledge| MCP
    Agent -->|memory.searchKnowledge| MCP
    MCP --> Store
    MCP --> Search
    Store --> Validate
    Validate --> SQLite
    SQLite --> FTS
    Search --> FTS
    FTS --> Rank
    Rank -->|Ranked Results| MCP
```

### Key Components and Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **MCP stdio Interface** | Handle JSON-RPC protocol, parse tool calls, return results |
| **Store Handler** | Process storage requests, validate input, check duplicates |
| **Search Handler** | Parse search queries, build FTS5 queries, coordinate ranking |
| **Validator** | Ensure knowledge quality (specific, actionable, not generic) |
| **Ranker** | Combine BM25 scores with priority, confidence, tags, scope |
| **SQLite + FTS5** | Persistent storage with full-text search indexing |

### Ranking Algorithm

The ranker combines multiple signals into a final relevance score:

```
final_score = bm25_score × priority_boost × confidence × tag_boost + scope_boost

Where:
  bm25_score    = FTS5 bm25() with column weights (title=10, content=5, tags=1)
  priority_boost = 1 + (priority - 5) × 0.05    // Range: 0.8 to 1.25
  confidence    = confidence value (0.0 to 1.0)
  tag_boost     = 1 + (matching_tags × 0.1)    // +10% per matching contextTag
  scope_boost   = +0.5 if scope matches query scope, +0.2 if global, 0 otherwise
```

**Ranking Priority** (highest to lowest):
1. Project-scoped results matching query scope
2. High BM25 score (title matches weighted highest)
3. High priority items (8-10)
4. High confidence items (> 0.8)
5. Items with matching contextTags
6. Global scope items

### Technology Stack
- **Runtime**: Node.js (v18+)
- **Database**: SQLite3 with FTS5 extension
- **Protocol**: MCP (Model Context Protocol) over stdio
- **Language**: TypeScript
- **Dependencies**: `better-sqlite3`, `@modelcontextprotocol/sdk`

## Data Models
**What data do we need to manage?**

### Core Entity: Knowledge Item

```typescript
interface KnowledgeItem {
  // Primary Key
  id: string;                    // UUID v4
  
  // Core Content
  title: string;                 // Short, explicit (5-12 words, max 100 chars)
  content: string;               // Detailed explanation, rationale, examples (max 5000 chars)
  
  // Classification
  tags: string[];                // Domain keywords (e.g., ["api", "backend", "dto"])
  scope: string;                 // "global" | "project:<name>" | "repo:<name>"
  category: string;              // "rule" | "guideline" | "decision" | "pattern"
  
  // Ranking Helpers
  priority: number;              // 1-10, higher = more important
  confidence: number;            // 0.0-1.0, reliability of the knowledge
  
  // Deduplication
  normalized_title: string;      // Lowercase, trimmed, normalized whitespace
  content_hash: string;          // SHA-256 of normalized content
  
  // Metadata
  created_at: string;            // ISO 8601 timestamp
  updated_at: string;            // ISO 8601 timestamp
  source: string;                // Origin of knowledge (manual, agent, import)
}
```

### SQLite Schema

```sql
-- Schema version tracking for migrations
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');

-- Main knowledge table
CREATE TABLE knowledge (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) <= 100),
  content TEXT NOT NULL CHECK (length(content) <= 5000),
  tags TEXT NOT NULL,                    -- JSON array stored as string
  scope TEXT NOT NULL DEFAULT 'global',
  category TEXT NOT NULL DEFAULT 'rule',
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  confidence REAL NOT NULL DEFAULT 0.8 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  normalized_title TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  
  -- Deduplication constraints
  UNIQUE (normalized_title, scope),
  UNIQUE (content_hash, scope)
);

-- FTS5 virtual table for full-text search
-- Column weights for bm25(): title=10, content=5, tags=1
-- Higher weight = more important for ranking
CREATE VIRTUAL TABLE knowledge_fts USING fts5(
  title,
  content,
  tags,
  content='knowledge',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER knowledge_ai AFTER INSERT ON knowledge BEGIN
  INSERT INTO knowledge_fts(rowid, title, content, tags)
  VALUES (NEW.rowid, NEW.title, NEW.content, NEW.tags);
END;

CREATE TRIGGER knowledge_ad AFTER DELETE ON knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content, tags)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.content, OLD.tags);
END;

CREATE TRIGGER knowledge_au AFTER UPDATE ON knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content, tags)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.content, OLD.tags);
  INSERT INTO knowledge_fts(rowid, title, content, tags)
  VALUES (NEW.rowid, NEW.title, NEW.content, NEW.tags);
END;

-- Indexes for fast filtering
CREATE INDEX idx_knowledge_scope ON knowledge(scope);
CREATE INDEX idx_knowledge_category ON knowledge(category);
CREATE INDEX idx_knowledge_priority ON knowledge(priority DESC);
```

### Data Flow

```mermaid
flowchart LR
    subgraph Store Flow
        A[Input] --> B[Validate]
        B --> C[Normalize]
        C --> D[Hash]
        D --> E{Duplicate?}
        E -->|Yes| F[Reject]
        E -->|No| G[Insert]
        G --> H[Update FTS]
    end
    
    subgraph Search Flow
        I[Query] --> J[Build FTS Query]
        J --> K[Execute BM25]
        K --> L[Apply Boosts]
        L --> M[Sort & Limit]
        M --> N[Return Results]
    end
```

## API Design
**How do components communicate?**

### MCP Tool: `memory.storeKnowledge`

**Purpose**: Store a new knowledge item

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "title": {
      "type": "string",
      "description": "Short, explicit description of the rule (5-12 words)",
      "minLength": 10,
      "maxLength": 100
    },
    "content": {
      "type": "string",
      "description": "Detailed explanation, rationale, and optional examples",
      "minLength": 50,
      "maxLength": 5000
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Domain keywords (e.g., ['api', 'backend', 'dto'])",
      "minItems": 1,
      "maxItems": 10
    },
    "scope": {
      "type": "string",
      "description": "Scope: 'global', 'project:<name>', or 'repo:<name>'",
      "default": "global"
    },
    "category": {
      "type": "string",
      "enum": ["rule", "guideline", "decision", "pattern"],
      "default": "rule"
    },
    "priority": {
      "type": "integer",
      "minimum": 1,
      "maximum": 10,
      "default": 5
    },
    "confidence": {
      "type": "number",
      "minimum": 0.0,
      "maximum": 1.0,
      "default": 0.8
    },
    "source": {
      "type": "string",
      "description": "Origin of knowledge",
      "default": "manual"
    }
  },
  "required": ["title", "content", "tags"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" },
    "id": { "type": "string" },
    "message": { "type": "string" }
  }
}
```

**Error Cases**:
- `VALIDATION_ERROR`: Title too short/long, content too generic
- `DUPLICATE_ERROR`: Knowledge with same title/scope or content hash exists
- `STORAGE_ERROR`: Database write failure

### MCP Tool: `memory.searchKnowledge`

**Purpose**: Retrieve relevant knowledge for a task

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Natural language task description",
      "minLength": 3,
      "maxLength": 500
    },
    "contextTags": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Tags inferred by the agent (e.g., ['api', 'backend'])",
      "default": []
    },
    "scope": {
      "type": "string",
      "description": "Optional project/repo scope filter",
      "default": null
    },
    "category": {
      "type": "string",
      "enum": ["rule", "guideline", "decision", "pattern", null],
      "description": "Filter by category"
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 20,
      "default": 5
    },
    "minConfidence": {
      "type": "number",
      "minimum": 0.0,
      "maximum": 1.0,
      "default": 0.0
    }
  },
  "required": ["query"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "title": { "type": "string" },
          "content": { "type": "string" },
          "tags": { "type": "array", "items": { "type": "string" } },
          "scope": { "type": "string" },
          "category": { "type": "string" },
          "priority": { "type": "integer" },
          "confidence": { "type": "number" },
          "score": { "type": "number", "description": "Combined relevance score" }
        }
      }
    },
    "totalMatches": { "type": "integer" },
    "query": { "type": "string" }
  }
}
```

**Empty Database Behavior**:
When the database is empty or no results match the query:
```json
{
  "results": [],
  "totalMatches": 0,
  "query": "the original query string"
}
```

## Component Breakdown
**What are the major building blocks?**

### Directory Structure
```
packages/knowledge-memory-service/
├── src/
│   ├── index.ts                 # Entry point, MCP server setup
│   ├── server.ts                # MCP server implementation
│   ├── handlers/
│   │   ├── store.ts             # memory.storeKnowledge handler
│   │   └── search.ts            # memory.searchKnowledge handler
│   ├── database/
│   │   ├── connection.ts        # SQLite connection management
│   │   ├── schema.ts            # Schema creation & migrations
│   │   └── queries.ts           # Prepared statements
│   ├── services/
│   │   ├── validator.ts         # Knowledge quality validation
│   │   ├── normalizer.ts        # Text normalization, hashing
│   │   └── ranker.ts            # Result ranking logic
│   ├── types/
│   │   └── index.ts             # TypeScript interfaces
│   └── utils/
│       ├── errors.ts            # Custom error classes
│       └── logger.ts            # Logging utilities
├── tests/
│   ├── unit/
│   │   ├── validator.test.ts
│   │   ├── normalizer.test.ts
│   │   └── ranker.test.ts
│   └── integration/
│       ├── store.test.ts
│       └── search.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

### Module Descriptions

| Module | Description |
|--------|-------------|
| **server.ts** | Sets up MCP stdio server, registers tools, handles lifecycle |
| **handlers/store.ts** | Validates input, checks duplicates, inserts knowledge |
| **handlers/search.ts** | Builds FTS query, executes search, applies ranking |
| **database/connection.ts** | Manages SQLite connection, enables WAL mode |
| **database/schema.ts** | Creates tables, FTS index, triggers, migrations |
| **services/validator.ts** | Checks title length, content specificity, tag validity |
| **services/normalizer.ts** | Lowercase, trim, normalize whitespace, compute hash |
| **services/ranker.ts** | Combines BM25 + priority + confidence + tags + scope |

## Design Decisions
**Why did we choose this approach?**

### Decision 1: SQLite + FTS5 over External Databases
**Choice**: SQLite with FTS5 full-text search  
**Rationale**:
- Zero external dependencies
- Single file, easy to backup/move
- FTS5 provides production-quality BM25 ranking
- Perfect for local-first, single-process architecture

**Alternatives Considered**:
- PostgreSQL: Too heavy, requires separate server
- Elasticsearch: Overkill for small knowledge base
- In-memory only: No persistence

### Decision 2: MCP stdio over HTTP
**Choice**: Model Context Protocol over stdio  
**Rationale**:
- Direct integration with AI agents
- No network overhead for local use
- Lower attack surface (no exposed ports)
- Easy evolution path: wrap stdio server with HTTP later

**Alternatives Considered**:
- HTTP REST API: More familiar, but unnecessary complexity for local use
- gRPC: Even more complex, overkill

### Decision 3: BM25 Lexical Search over Embeddings
**Choice**: FTS5 BM25 ranking for MVP  
**Rationale**:
- Deterministic, explainable results
- No external embedding API needed
- Fast, well-understood algorithm
- Embeddings can be added later as optional boost

**Alternatives Considered**:
- Vector embeddings (OpenAI): Requires API, adds latency, cost
- Hybrid BM25 + embeddings: Defer to later iteration

### Decision 4: Dual Deduplication Strategy
**Choice**: Unique constraints on (normalized_title, scope) AND (content_hash, scope)  
**Rationale**:
- Catches both title-based and content-based duplicates
- Normalized title handles minor wording differences
- Content hash catches copy-paste with different titles

### Decision 5: Scoped Knowledge with Project Priority
**Choice**: Scope as string (`global`, `project:X`, `repo:X`) with project-specific rules ranked higher  
**Rationale**:
- Simple, extensible format
- Allows future scopes without schema changes
- Project-specific rules get +0.5 boost, global gets +0.2 boost
- Both results shown, but project-scoped rules appear first

### Decision 6: Simple Version-Based Migrations
**Choice**: Store schema version in `meta` table, run migrations sequentially on startup  
**Rationale**:
- No external migration framework needed
- Simple numeric versioning (1, 2, 3...)
- Migration functions run once and are idempotent
- Easy to understand and debug

**Alternatives Considered**:
- Knex/TypeORM migrations: Too heavy for local-first
- No migrations: Can't evolve schema

## Non-Functional Requirements
**How should the system perform?**

### Performance Targets
| Metric | Target |
|--------|--------|
| Storage latency | < 100ms |
| Search latency | < 50ms (< 1000 items) |
| Cold start time | < 500ms |
| Memory footprint | < 100MB |
| Database size | < 50MB per 10,000 items |

### Scalability Considerations
- SQLite handles 10,000+ items efficiently with proper indexing
- FTS5 index scales linearly with content size
- WAL mode enables concurrent reads during writes
- For larger scale, evolve to PostgreSQL or HTTP service

### Security Requirements
- No authentication required (local process)
- Input validation prevents SQL injection (parameterized queries)
- Content length limits prevent DoS
- No sensitive data expected (guidelines, not secrets)

### Reliability/Availability Needs
- Graceful handling of database corruption
- Automatic schema migration on startup
- Transaction safety for writes
- No data loss on crash (SQLite durability)
