---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Scope

- Add an `agent-manager` readiness module that can report readiness for every startable adapter.
- Migrate CLI status agent checks to the new module.
- Keep CLI-owned checks in the CLI service.
- Keep rendering dynamic and status scoring limited to checks that have real pass/warn/fail meaning.

## Implementation Notes

- Existing in-progress status changes already made registries/channels informational and consolidated tmux inspection.
- Missing project `.ai-devkit.json` is warning-level because a directory can still be usable outside an initialized AI DevKit project; malformed project config remains failure-level.
- Added `packages/agent-manager/src/readiness/AgentReadiness.ts`.
- Exported `getAgentReadinessReport`, `getAgentReadinessReports`, readiness types, and `worstReadinessStatus` from `@ai-devkit/agent-manager`.
- Removed CLI-local adapter readiness checks from `packages/cli/src/services/status/status.service.ts`.
- `status.service.ts` now passes CLI-owned built-in skill names and per-adapter skill roots into `agent-manager`.
- `render.ts` now iterates executable `report.agents` dynamically and renders optional `auth` and `integration` checks only when present.
- Removed separate console warning lines for missing built-in skills.
- Pi plugin detection accepts both `@ai-devkit/pi-session-tracker` and `session tracker` display names from `pi list`.
- AI DevKit built-in skill counts are informational and do not affect readiness scoring.
- Human status output renders `pass` as `ready` and `warn` as `not ready`; JSON keeps the canonical status values.
- Copilot auth now uses the read-only GitHub CLI probe `gh auth status --hostname github.com` because Copilot can authenticate through `gh`.
- OpenCode auth now runs `opencode auth list`, strips ANSI output, and reports credential/environment names as available providers.
- `gemini_cli` is omitted from readiness reports while the adapter is pending removal.
- Adapters without an executable remain available in raw diagnostics, but are excluded from scored readiness totals and human status tables.
- Adapter-specific auth and integration dispatch uses lookup maps so adding or removing checks does not require branching in the generic readiness flow.
- OpenCode ANSI output normalization uses a small shared regex-backed helper.
- Built status smoke output confirms Pi auth providers `anthropic` and `litellm` are reported without credential values.

## Verification

- Passed: `npm test --workspace=@ai-devkit/agent-manager -- --run src/__tests__/readiness/AgentReadiness.test.ts`
- Passed: `npm test --workspace=ai-devkit -- --run src/__tests__/commands/status.test.ts src/__tests__/services/status/status.service.test.ts`
- Passed: `npm run build --workspace=@ai-devkit/agent-manager`
- Passed: `npm run build --workspace=ai-devkit`
- Passed: `npm run lint --workspace=@ai-devkit/agent-manager`
- Passed with three pre-existing warnings outside touched files: `npm run lint --workspace=ai-devkit`
- Passed smoke: `node packages/cli/dist/cli.js status`

## Development Setup
**How do we get started?**

- Prerequisites and dependencies
- Environment setup steps
- Configuration needed

## Code Structure
**How is the code organized?**

- Directory structure
- Module organization
- Naming conventions

## Implementation Notes
**Key technical details to remember:**

### Core Features
- Feature 1: Implementation approach
- Feature 2: Implementation approach
- Feature 3: Implementation approach

### Patterns & Best Practices
- Design patterns being used
- Code style guidelines
- Common utilities/helpers

## Integration Points
**How do pieces connect?**

- API integration details
- Database connections
- Third-party service setup

## Error Handling
**How do we handle failures?**

- Error handling strategy
- Logging approach
- Retry/fallback mechanisms

## Performance Considerations
**How do we keep it fast?**

- Optimization strategies
- Caching approach
- Query optimization
- Resource management

## Security Notes
**What security measures are in place?**

- Authentication/authorization
- Input validation
- Data encryption
- Secrets management
