---
phase: testing
title: Knowledge Memory Service - Testing Strategy
description: Testing approach, test cases, and quality assurance for Knowledge Memory Service
---

# Testing Strategy

## Test Coverage Goals

- Unit test coverage: 100% of new code
- Integration tests: All critical paths + error handling
- Definition of Done: API-specific rules appear in top 3 for API-related queries

## Unit Tests

### Normalizer Module
- [ ] `normalizeTitle()` lowercases and trims whitespace
- [ ] `normalizeTitle()` collapses multiple spaces
- [ ] `hashContent()` produces consistent SHA-256 hashes
- [ ] `hashContent()` is case-insensitive

### Validator Module
- [ ] Valid input passes validation
- [ ] Title < 10 chars rejected
- [ ] Title > 100 chars rejected
- [ ] Content < 50 chars rejected
- [ ] Generic content phrases rejected
- [ ] Invalid scope format rejected
- [ ] Invalid tags (non-alphanumeric) rejected
- [ ] Too many tags (>10) rejected

### Ranker Module
- [ ] BM25 score integrated correctly
- [ ] Priority boost applied (higher priority = higher score)
- [ ] Confidence boost applied
- [ ] Tag match boost: +0.2 per matching tag
- [ ] Scope match boost: project-specific > global

## Integration Tests

### Store Handler
- [ ] Successfully stores valid knowledge item
- [ ] Returns generated UUID
- [ ] Duplicate title+scope rejected with error
- [ ] Duplicate content hash rejected with error
- [ ] Validation errors returned properly
- [ ] FTS index updated after insert

### Search Handler
- [ ] Basic query returns relevant results
- [ ] Empty query handled gracefully
- [ ] Tag filtering works correctly
- [ ] Scope filtering returns correct results
- [ ] Results ordered by combined score
- [ ] Limit parameter respected (default 5, max 20)
- [ ] minConfidence filter applied

### Retrieval Definition of Done Test
- [ ] Given: API-specific rules exist in database
- [ ] When: Query "building an API endpoint" is executed
- [ ] Then: API rules appear in top 3 results

## End-to-End Tests

### MCP Tool Integration
- [ ] `memory.storeKnowledge` callable via MCP
- [ ] `memory.searchKnowledge` callable via MCP
- [ ] Error responses are valid MCP format
- [ ] Server starts and connects via stdio

## Test Data

### Seed Data for Testing
```typescript
const testKnowledge = [
  {
    title: 'Always use Response DTOs for API endpoints',
    content: 'When building REST APIs, never return domain entities...',
    tags: ['api', 'backend', 'dto'],
    scope: 'global',
    priority: 8,
  },
  {
    title: 'Use dependency injection for testability',
    content: 'All services should receive dependencies via constructor...',
    tags: ['testing', 'architecture', 'di'],
    scope: 'global',
    priority: 7,
  },
];
```

## Test Reporting

```bash
# Run tests with coverage
npm test -- --coverage

# Coverage thresholds
statements: 80%
branches: 80%
functions: 80%
lines: 80%
```

## Manual Testing

- [ ] Start server with `npm start`
- [ ] Store knowledge via MCP client
- [ ] Search knowledge via MCP client
- [ ] Verify database file created
- [ ] Test with Claude/MCP client

## Performance Testing

- [ ] Storage operation < 100ms
- [ ] Search operation < 50ms (< 1000 items)
- [ ] Database handles 10,000+ items
