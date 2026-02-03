---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup
**How do we get started?**

- Prerequisites and dependencies
  - Node.js, npm, HTTP access to GitHub API
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
- Feature 2a: Use GitHub tree API to list `skills/` folders
- Feature 2b: Fetch raw `SKILL.md` per skill for description
- Feature 3: Keyword search across index entries and output results

### Patterns & Best Practices
- Prefer small pure functions for search and filtering logic
- Keep IO (Git/HTTP) isolated from search logic
- Fail-soft on refresh: use stale index if update fails

## Integration Points
**How do pieces connect?**

- API integration details
  - GitHub tree API for `skills/` path listing
  - GitHub raw file fetch for `SKILL.md`
- Database connections
  - Local cache file under user cache dir
- Third-party service setup
  - GitHub API with optional token for higher rate limits

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
- Performance target
  - Warm-cache search under 500ms
- Caching approach
  - TTL-based refresh with manual override
  - Optional async rebuild after returning cached results
- Query optimization
  - Pre-normalize keywords and skill names to lowercase
- Resource management
  - Avoid full clones; read only `skills/` metadata via API

## Security Notes
**What security measures are in place?**

- Authentication/authorization
  - Support optional GitHub token to increase rate limits
- Input validation
  - Validate keyword length and sanitize output
- Data encryption
  - Not required for local index
- Secrets management
  - Never store tokens in index file

