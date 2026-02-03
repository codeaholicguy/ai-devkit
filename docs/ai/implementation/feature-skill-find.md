---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup
**How do we get started?**

- Prerequisites and dependencies
  - Node.js, npm, Git (or HTTP access to registries)
- Environment setup steps
  - `npm install`
- Configuration needed
  - Registry list at `skills/registry.json`
  - Local cache at `~/.ai-devkit/skills.json`

## Code Structure
**How is the code organized?**

- Directory structure
  - CLI command: `packages/...` (skill command module)
  - Index utilities: `packages/.../skills/index`
- Module organization
  - `registry-reader`, `index-builder`, `search`, `output-format`
- Naming conventions
  - `skill-find` for command, `skill-index` for cache utilities

## Implementation Notes
**Key technical details to remember:**

### Core Features
- Feature 1: Implement `skill find <keyword>` command entry and parsing
- Feature 2: Build/update local index with TTL and `--refresh`
- Feature 2a: Fetch `SKILL.md` from each skill folder for description
- Feature 3: Keyword search across index entries and output results

### Patterns & Best Practices
- Prefer small pure functions for search and filtering logic
- Keep IO (Git/HTTP) isolated from search logic
- Fail-soft on refresh: use stale index if update fails

## Integration Points
**How do pieces connect?**

- API integration details
  - Git `ls-remote` or sparse checkout to read `skills/` entries
- Database connections
  - Local cache file under user cache dir
- Third-party service setup
  - Optional registry-hosted `skills/index.json`

## Error Handling
**How do we handle failures?**

- Error handling strategy
  - Return non-zero exit for fatal failures
  - Show warnings for partial registry failures
- Logging approach
  - Use existing CLI logger for warnings/errors
- Retry/fallback mechanisms
  - Use stale index if refresh fails

## Performance Considerations
**How do we keep it fast?**

- Optimization strategies
  - Cache index and avoid repeated network calls
- Caching approach
  - TTL-based refresh with manual override
  - Optional async rebuild after returning cached results
- Query optimization
  - Pre-normalize keywords and skill names to lowercase
- Resource management
  - Avoid full clones; read only `skills/` metadata

## Security Notes
**What security measures are in place?**

- Authentication/authorization
  - Respect Git auth for private registries
- Input validation
  - Validate keyword length and sanitize output
- Data encryption
  - Not required for local index
- Secrets management
  - Never store tokens in index file

