---
phase: implementation
title: Implementation Guide
description: Implementation notes for deterministic feature-document initialization command
---

# Implementation Guide

## Development Setup
- Work in `packages/cli`.
- Use existing npm workspace dependencies.
- Verification commands:
  - `npx tsc --noEmit`
  - `npx jest --config jest.config.js --runInBand`
  - `npx ai-devkit@latest lint --feature docs-init-feature-command`

## Code Structure
- Command registration: `packages/cli/src/cli.ts`
- New command handler: `packages/cli/src/commands/docs.ts`
- Template creation: `packages/cli/src/lib/TemplateManager.ts`
- Config lookup: `packages/cli/src/lib/Config.ts`
- Date formatting and validation: `packages/cli/src/util/time.ts`
- Lint compatibility: `packages/cli/src/services/lint/rules/feature-docs.rule.ts`
- Command tests: `packages/cli/src/__tests__/commands/docs.test.ts`
- Template manager tests: `packages/cli/src/__tests__/lib/TemplateManager.test.ts`

## Implementation Notes

### Core Features
- `docs init-feature <name>` should normalize optional `feature-` prefix and create files as `YYYY-MM-DD-feature-{name}.md`.
- The command should create feature docs for phases configured in `.ai-devkit.json`, falling back to default lifecycle phases when config is absent or empty.
- The default date must be local date, not UTC.
- The command should print the created paths so agents can fill exact files.
- The command should fail clearly for invalid names and existing targets.
- `--json` should return `feature`, `date`, `docsDir`, and generated phase paths.
- Target conflicts should be detected before any file is copied.

### Patterns & Best Practices
- Reuse `fs-extra` because `TemplateManager` already depends on it.
- Keep filesystem writes inside `TemplateManager`.
- Keep user-facing command output in the command handler.
- Prefer dependency injection for date in tests rather than mocking global time where possible.

## Integration Points
- `/new-requirement` should call the new command before filling docs.
- `ai-devkit lint --feature` should continue accepting legacy docs and date-prefixed docs.
- Config-driven docs dir should continue to work for projects that use non-default docs paths.
- Config-driven phases should continue to work for projects that install a subset or expanded set of phases.
- `TemplateManager` remains the only component that writes feature docs.

## Error Handling
- Invalid feature name: set non-zero exit code and show accepted naming guidance.
- Missing base phase template: surface the source path and suggest `ai-devkit init`.
- Existing target file: fail by default and list conflicting files.
## Performance Considerations
- The command writes one small markdown file per configured phase; performance is not a concern.
- Preflight target paths before copying to avoid partial writes.

## Security Notes
- Validate feature names to avoid path traversal.
- Resolve docs paths under the configured project docs directory.
- Do not accept arbitrary template source paths in this command.
