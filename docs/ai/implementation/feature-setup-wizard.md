---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup
**How do we get started?**

- Prerequisites and dependencies
  - Node.js and npm installed
  - Existing CLI project bootstrap complete
- Environment setup steps
  - `npm install`
  - `npm run build`
  - `npm test` (baseline before changes)
- Configuration needed
  - Existing templates in `packages/cli/templates`
  - Environment capability definitions in `packages/cli/src/util/env.ts`

## Code Structure
**How is the code organized?**

- Directory structure
  - `packages/cli/src/commands/setup.ts` (entrypoint orchestration)
  - `packages/cli/src/lib/EnvironmentSelector.ts` (wizard interaction)
  - `packages/cli/src/lib/TemplateManager.ts` (asset application)
  - Add new modules:
    - `packages/cli/src/lib/setup/SetupWizardService.ts`
    - `packages/cli/src/lib/setup/SetupPlanner.ts`
    - `packages/cli/src/lib/setup/SetupExecutor.ts`
    - `packages/cli/src/lib/setup/SetupStateRepository.ts`
    - `packages/cli/src/lib/setup/ProfileRecommendationService.ts`
    - `packages/cli/src/lib/setup/adapters/*.ts`
- Module organization
  - Keep command thin and push behavior into testable services.
  - Keep planner pure (input -> plan) and executor side-effectful.
- Naming conventions
  - `*Plan`, `*Executor`, `*Adapter`, `*Report` for clear responsibility boundaries.

## Implementation Notes
**Key technical details to remember:**

### Core Features
- Feature 1: Wizard-first setup flow
  - Default `setup` runs wizard.
  - Legacy `--global` remains as compatibility alias and maps into wizard preset.
- Feature 2: Plan/apply architecture
  - Build a deterministic `SetupPlan` before any write.
  - Support `--dry-run` and `--json` reporting.
- Feature 3: Multi-tool adapter support
  - Implement adapters for Codex, Claude Code, Antigravity first.
  - Each adapter exposes capabilities and path rules for commands/skills/instruction docs.
- Feature 4: Idempotent reruns
  - Fingerprint targets; skip unchanged files.
  - Backup modified targets before overwrite if policy requires.

### Patterns & Best Practices
- Keep CLI prompts and business logic separate.
- Use explicit operation objects rather than inline file writes.
- Treat partial failure as recoverable; continue safe operations and summarize errors.
- Prefer append-only logs/reporting and avoid hidden side effects.

## Integration Points
**How do pieces connect?**

- API integration details
  - No required external APIs for v1.
  - Optional future online metadata can be integrated behind a feature flag.
- Database connections
  - No database; local JSON state only.
- Third-party service setup
  - No third-party service required for core wizard execution.

## Error Handling
**How do we handle failures?**

- Error handling strategy
  - Planner errors fail fast before any write.
  - Executor errors are collected per operation and reported clearly.
- Logging approach
  - Reuse terminal UI helpers for info/warn/error channels.
  - Include target path + operation type in error output.
- Retry/fallback mechanisms
  - For write conflicts, allow retry with alternate policy (skip/overwrite/backup).
  - Preserve successfully applied operations even when later steps fail.

## Performance Considerations
**How do we keep it fast?**

- Optimization strategies
  - Cache detection results during a single wizard run.
  - Compare fingerprints to skip unchanged targets.
- Caching approach
  - Persist setup state to avoid redundant checks across reruns.
- Query optimization
  - Not applicable (local file operations only in v1).
- Resource management
  - Use bounded concurrency for file operations to avoid I/O spikes.

## Security Notes
**What security measures are in place?**

- Authentication/authorization
  - No auth handling inside setup; delegate to tool-native auth.
- Input validation
  - Validate all tool codes, profile names, and asset types before planning.
- Data encryption
  - Not required for non-sensitive setup state.
- Secrets management
  - Never copy or persist API keys from environment/tool configs.
  - Explicitly avoid touching credential stores (`auth.json`, keychain-backed configs).

