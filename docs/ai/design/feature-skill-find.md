---
phase: design
title: System Design & Architecture
description: Define the technical architecture, components, and data models
---

# System Design & Architecture

## Architecture Overview
**What is the high-level system structure?**

- Include a mermaid diagram that captures the main components and their relationships.
  ```mermaid
  graph TD
    User -->|CLI| SkillFind
    SkillFind --> RegistryList
    SkillFind --> IndexStore
    SkillFind --> IndexBuilder
    IndexBuilder -->|GitHub tree API| RegistryApi
    IndexBuilder -->|raw SKILL.md| RawFiles
    RegistryApi -->|skills paths| IndexBuilder
    RawFiles -->|descriptions| IndexBuilder
  ```
- Key components and their responsibilities
  - SkillFind: CLI command `skill find` orchestrates index checks and search.
  - RegistryList: reads `skills/registry.json` to discover registries.
  - IndexBuilder: builds or updates a local index without full clones.
  - IndexStore: local cache file (json) with searchable entries and metadata.
  - RegistrySources: GitHub API access to registry metadata and raw files.
- Technology stack choices and rationale
  - Node/TypeScript to align with existing CLI.
  - Git commands or HTTP fetch for low-cost metadata access.
  - Local cache under user cache dir to avoid repo writes.

## Data Models
**What data do we need to manage?**

- Core entities and their relationships
  - Registry: `{ name, url, branch?, skillsPath }`
  - SkillEntry: `{ name, registry, path, description, lastIndexed }` (description from `SKILL.md`)
  - IndexMeta: `{ version, createdAt, updatedAt, ttlSeconds, registriesHash, registryHeads? }`
- Data schemas/structures
  - `index.json` with `{ meta, skills: SkillEntry[] }`
- Data flow between components
  - RegistryList -> IndexBuilder (registry config)
  - IndexBuilder -> IndexStore (write updated index)
  - SkillFind -> IndexStore (read and search)

## API Design
**How do components communicate?**

- External APIs (if applicable)
  - GitHub REST tree API to list `skills/` paths without cloning.
  - GitHub raw file fetch to read each `SKILL.md` description.
  - Git `ls-remote` to detect head changes for refresh decisions.
- Internal interfaces
  - `getRegistries(): Registry[]`
  - `ensureIndex(registries): Index` (checks TTL, registry list hash, optional head hash)
  - `searchIndex(index, keyword): SkillEntry[]`
- Request/response formats
  - CLI: `npx ai-devkit@latest skill find <keyword>`
  - Output: table or list with `skillName` and `description`
- Authentication/authorization approach
  - GitHub unauthenticated rate limits apply (60 requests/hour).
  - Support tokens if users configure them to increase limits.

## Component Breakdown
**What are the major building blocks?**

- Frontend components (if applicable)
  - CLI output formatting only (no UI).
- Backend services/modules
  - `skill-find` command handler.
  - `registry-reader` to parse registry list.
  - `index-builder` to assemble skill entries.
  - `search` utility for keyword matching.
- Database/storage layer
  - Local cache file in user cache dir (json).
- Third-party integrations
  - GitHub REST API for tree listing and raw file fetch.
  - Git CLI for optional head hash checks.

## Design Decisions
**Why did we choose this approach?**

- Key architectural decisions and trade-offs
  - Use local index to avoid repeated network calls per search.
  - Prefer metadata fetch over full repo clone for speed and bandwidth.
  - TTL-based refresh plus manual `--refresh` option for freshness control.
  - Optionally compare remote head hashes to detect changes cheaply.
  - Store index at `~/.ai-devkit/skills.json`.
- Alternatives considered
  - Git sparse checkout of `skills/` only (still needs Git and network).
  - Remote centralized index service (fast, but adds infra and availability).
  - On-demand repo scan per search (simple but slow and wasteful).
- Patterns and principles applied
  - Cache with explicit invalidation (TTL + registry list hash).
  - Fail-soft behavior (use stale index if refresh fails).

## Non-Functional Requirements
**How should the system perform?**

- Performance targets
  - Search completes in < 500ms with a warm index.
  - Index refresh completes in < 30s for typical registry sizes.
- Scalability considerations
  - Index size grows linearly with skills; support thousands of entries.
  - Avoid full clones to keep bandwidth stable as registries grow.
- Security requirements
  - Avoid executing registry code; only read metadata paths.
  - Do not store credentials in index.
- Reliability/availability needs
  - Use last-known index if refresh fails.
  - Provide clear error messaging for unreachable registries.

