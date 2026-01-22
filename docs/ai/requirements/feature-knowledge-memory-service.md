---
phase: requirements
title: Knowledge Memory Service - Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria for the Knowledge Memory Service
---

# Requirements & Problem Understanding

## Problem Statement
**What problem are we solving?**

AI agents lack persistent, actionable memory across tasks. When an agent performs a task (e.g., building an API endpoint), it cannot automatically recall and apply prior knowledge such as:
- "Always use a Response DTO for APIs"
- "Follow RESTful naming conventions"
- "Use dependency injection for testability"

**Who is affected by this problem?**
- AI agents that need to follow coding standards and best practices
- Developers using AI coding assistants who want consistent, high-quality output
- Teams that want to encode their engineering guidelines for AI consumption

**What is the current situation/workaround?**
- Knowledge is manually injected into prompts each time
- Guidelines are lost between sessions
- No systematic way to retrieve context-relevant rules
- Agents make inconsistent decisions without historical context

## Goals & Objectives
**What do we want to achieve?**

### Primary Goals
1. **Store reusable, high-quality knowledge rules** - Not chat history, but actionable engineering guidelines
2. **Retrieve the right knowledge at the right time** - Based on task context, tags, and scope
3. **Provide deterministic, explainable retrieval** - Lexical, rule-based ranking with FTS5 BM25
4. **Be lightweight, portable, and easy to run** - Single Node.js process + one SQLite file
5. **Be MCP-compatible and agent-friendly** - Runs as an MCP stdio server

### Secondary Goals
- Easy evolution path to a centralized HTTP service later
- Support for project-specific and global rules
- High-quality deduplication to prevent knowledge bloat
- Fast retrieval for real-time agent workflows

### Non-Goals (explicitly out of scope)
- Long-term conversational memory or chat transcripts
- Complex knowledge graphs or ontologies
- Mandatory vector embeddings (may be added later as optional)
- Distributed write-heavy workloads
- Multi-user authentication/authorization
- Cloud deployment (local-first design)

## User Stories & Use Cases
**How will users interact with the solution?**

### US-1: Rule Recall
**As an** AI agent building an API endpoint,  
**I want to** retrieve relevant API design rules,  
**So that** I apply best practices like "Always return a Response DTO, not a domain entity."

### US-2: Engineering Guidelines
**As an** AI agent writing code,  
**I want to** access coding standards and architectural decisions,  
**So that** my output is consistent with team conventions.

### US-3: Project-Specific Knowledge
**As an** AI agent working on a specific repository,  
**I want to** retrieve rules scoped to this project,  
**So that** I follow project-specific conventions over generic guidelines.

### US-4: Agent Planning Support
**As an** AI agent planner,  
**I want to** inject retrieved knowledge into my context before execution,  
**So that** my decisions are informed by accumulated wisdom.

### US-5: Knowledge Storage
**As a** developer/admin,  
**I want to** store new actionable knowledge items,  
**So that** agents can benefit from captured guidelines.

### Key Workflows
1. **Store Knowledge Flow**: Agent or human captures a new rule → validates quality → stores with tags/scope → deduplication check
2. **Retrieve Knowledge Flow**: Agent has task context → extracts relevant tags → queries memory → ranks results → injects top-K into context
3. **Scoped Retrieval Flow**: Agent identifies project scope → retrieves project-specific rules first → falls back to global rules

### Edge Cases to Consider
- Empty query or no matching results → Return empty array with `totalMatches: 0`
- Very broad queries returning too many results → Use `limit` parameter (default 5, max 20) to return top-K highest ranking
- Conflicting rules (project vs global) → Project-specific ranked higher (+0.5 vs +0.2), both shown
- Duplicate submissions with slight variations → Blocked by normalized_title + content_hash constraints
- Extremely long content fields → Enforced 5000 char max at validation
- Invalid scope formats → Rejected with validation error

## Success Criteria
**How will we know when we're done?**

### Measurable Outcomes
1. **Retrieval Relevance**: If a task is API-related, API-specific rules must appear in the top 3 results
2. **Storage Quality**: 100% of stored items pass validation (specific, actionable, not generic)
3. **Deduplication**: No duplicate entries for same (normalized_title, scope) or content hash
4. **Performance**: Retrieval completes in < 50ms for typical queries (< 1000 items)

### Acceptance Criteria
- [ ] MCP stdio server runs successfully with `npx`
- [ ] `memory.storeKnowledge` tool stores valid knowledge items
- [ ] `memory.storeKnowledge` rejects generic/vague knowledge
- [ ] `memory.storeKnowledge` prevents duplicates
- [ ] `memory.searchKnowledge` retrieves relevant results ranked by FTS5 BM25
- [ ] Results are boosted by priority, confidence, tag matches, and scope
- [ ] SQLite database persists across restarts
- [ ] FTS5 indexes are properly configured and used

### Performance Benchmarks
- Storage operation: < 100ms
- Retrieval operation: < 50ms (cold), < 20ms (warm)
- Database size: Efficient for 10,000+ knowledge items

## Constraints & Assumptions
**What limitations do we need to work within?**

### Technical Constraints
- Must use SQLite + FTS5 for storage (no external dependencies)
- Must run as MCP stdio server (not HTTP initially)
- Must be a single Node.js process
- Must work offline (local-first)

### Business Constraints
- No external API dependencies for core functionality
- Must be open-source friendly
- No paid/proprietary embedding services required

### Assumptions
- Agents can extract relevant context tags from task descriptions
- Knowledge items are curated, not auto-generated at scale
- Quality over quantity for stored knowledge
- BM25 lexical search is sufficient for MVP (embeddings optional later)

## Questions & Open Items
**What do we still need to clarify?**

### Resolved Questions
- Q: What database to use? → A: SQLite + FTS5
- Q: HTTP or stdio? → A: MCP stdio (HTTP evolution later)
- Q: Embeddings required? → A: No, optional for later
- Q: Confidence threshold? → A: **No filtering by default**. Provide `minConfidence` parameter (default: 0.0) so agents can decide. Recommended threshold for agents: 0.3
- Q: Conflicting rules (project vs global)? → A: **Project-specific rules prioritized** via scope boost (+0.5 for project, +0.2 for global). Both shown in results, project-scoped first.
- Q: Maximum content length? → A: **5000 characters**. Enough for explanation + examples, enforces atomic knowledge.
- Q: Rate limiting on storage? → A: **No rate limiting** (local-first). Agent can detect trigger phrases before calling storeKnowledge.
- Q: Database migrations? → A: **Simple version-based migrations**. Store schema version in `meta` table, run sequentially on startup.

### Open Questions
*All questions resolved.*

### Research Needed
- Best practices for FTS5 tokenizer configuration
- Optimal BM25 parameters for short-form knowledge retrieval
