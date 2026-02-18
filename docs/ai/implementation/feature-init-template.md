---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup
**How do we get started?**

- Work in `packages/cli` (TypeScript + Commander + Jest).
- Template parsing uses existing dependency `yaml` and `fs-extra`.
- Run focused tests with:
  - `npm --workspace packages/cli test -- init.test.ts InitTemplate.test.ts`

## Code Structure
**How is the code organized?**

- `packages/cli/src/lib/InitTemplate.ts`
  - Loads template file from relative/absolute path.
  - Parses YAML (`.yml`/`.yaml`) and JSON (`.json`).
  - Validates schema for `environments`, `phases`, `skills`.
- `packages/cli/src/commands/init.ts`
  - Adds template-mode resolution for environments/phases.
  - Keeps fallback interactive prompts for missing values.
  - Installs template skills via `SkillManager.addSkill`.
  - Handles duplicate `registry+skill` and continue-on-error warnings.
- `packages/cli/src/cli.ts`
  - Adds `--template <path>` option to `init` command.

## Implementation Notes
**Key technical details to remember:**

### Core Features
- `init --template` is additive, not a replacement for interactive mode.
- Resolution order:
  - Environments: CLI `--environment` > template `environments` > prompt.
  - Phases: CLI `--all/--phases` > template `phases` > prompt.
- Skill processing:
  - Same registry with multiple skills is valid.
  - Exact duplicate `registry+skill` entries are skipped with warning.
  - Failed skill installs are reported; init continues.

### Patterns & Best Practices
- Validation errors include template file path + field context.
- Template is fully validated before applying side effects.
- Existing `skill add` logic is reused through `SkillManager` to avoid behavior drift.

## Integration Points
**How do pieces connect?**

- `init` command orchestrates:
  - `loadInitTemplate` -> environment/phase setup via `TemplateManager` -> skill installs via `SkillManager`.
- No new storage/manifest is introduced in v1.

## Error Handling
**How do we handle failures?**

- Invalid template path/format/schema: fail early with actionable error.
- Skill install failures: continue processing remaining skills, emit warnings.
- Exit behavior for partial skill failure: command returns success (`0`) with warnings.

## Performance Considerations
**How do we keep it fast?**

- Parsing/validation are in-memory and lightweight.
- No network operation introduced beyond existing `skill add` behavior.

## Security Notes
**What security measures are in place?**

- Template input is treated as untrusted and schema-validated.
- No shell execution from template fields.
- Only known keys and expected scalar/array/object shapes are accepted.
