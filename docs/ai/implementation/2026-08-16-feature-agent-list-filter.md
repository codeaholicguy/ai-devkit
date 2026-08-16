---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Agent Name Filter Implementation

## Development Setup
**How do we get started?**

- Use the repository Node/npm workspace with existing dependencies.
- Run focused Vitest from the repository root and CLI lint/build through the package scripts.
- No configuration, migration, or new dependency is required.

## Code Structure
**How is the code organized?**

- `packages/cli/src/tui/console/filter/agentFilter.ts`: pure name-filter operations.
- `packages/cli/src/__tests__/tui/console/filter/agentFilter.test.ts`: behavior and coverage contract.
- Console integration and component files will be recorded as their tasks complete.

## Implementation Notes
**Key technical details to remember:**

### Core Features

- Task 1.1: case-insensitive substring matching uses plain `toLowerCase()`, returns every non-overlapping occurrence range, preserves arbitrary input order, and returns the original array for an empty query.

### Patterns & Best Practices
- Keep matching pure and dependency-free.
- Treat the received agent order as authoritative; never sort or partition.
- Drive each behavior through a failing focused test before production code.

## Integration Points
**How do pieces connect?**

- The filter module consumes `AgentInfo[]` and is ready for `ConsoleAppShell` composition.
- No database, external API, or third-party integration is involved.

## Error Handling
**How do we handle failures?**

- No exceptions or logging are introduced. A non-match is represented as `null` positions or an omitted agent.

## Performance Considerations
**How do we keep it fast?**

- Matching is linear over the received array and names. Empty query avoids allocation by returning the input array.

## Security Notes
**What security measures are in place?**

- Query text is ephemeral local UI state and is not executed or persisted. No authentication, encryption, or secret handling changes.
