---
phase: design
title: System Design & Architecture
description: Design for deterministic feature-document initialization command
---

# System Design & Architecture

## Architecture Overview
The implementation should centralize feature-doc file creation in the CLI and keep agents on top of the generated paths.

```mermaid
graph TD
  User[Developer or Agent] --> CLI[ai-devkit docs init-feature]
  CLI --> DocsCommand[docs command handler]
  DocsCommand --> Config[ConfigManager docs dir and phases]
  DocsCommand --> FeatureName[Feature name validation]
  DocsCommand --> TemplateManager[TemplateManager feature doc creation]
  TemplateManager --> PhaseTemplates[docs/ai/{phase}/README.md]
  TemplateManager --> FeatureDocs[docs/ai/{phase}/YYYY-MM-DD-feature-{name}.md]
  Lint[ai-devkit lint --feature] --> Resolver[Feature doc resolver]
  Resolver --> FeatureDocs
  Resolver --> LegacyDocs[docs/ai/{phase}/feature-{name}.md]
```

Key responsibilities:
- Commander registration exposes a `docs` namespace with `init-feature`.
- The command handler validates input, resolves docs dir and configured phases, computes date prefix, and delegates file creation.
- `TemplateManager` performs template copying and path construction.
- Lint remains read-only and accepts both new and legacy docs.
- Command templates tell agents to call the initializer and then edit returned files.

## Data Models
Primary command options:

```ts
interface InitFeatureDocsOptions {
  json?: boolean;
}

interface FeatureDocTemplateOptions {
  date: string;
  phases: Phase[];
}

interface FeatureDoc {
  phase: Phase;
  // Relative path printed to users and JSON consumers.
  path: string;
}

interface InitFeatureDocsResult {
  feature: string;
  date: string;
  docsDir: string;
  files: FeatureDoc[];
}
```

Date format:
- Accepted format: `YYYY-MM-DD`.
- Default source: local `Date`, formatted with `getFullYear()`, `getMonth() + 1`, and `getDate()`.
- Avoid `toISOString().slice(0, 10)` because it uses UTC and can produce tomorrow/yesterday around local midnight.

Filename format:
- New convention: `{docsDir}/{phase}/{YYYY-MM-DD}-feature-{normalizedName}.md`
- Legacy lookup remains: `{docsDir}/{phase}/feature-{normalizedName}.md`
- Phase source: `.ai-devkit.json` `phases`, falling back to the default lifecycle phases when config is missing or empty.

## API Design
CLI:

```bash
ai-devkit docs init-feature <name>
ai-devkit docs init-feature <name> --json
```

Potential JSON output:

```json
{
  "feature": "user-authentication",
  "date": "2026-05-24",
  "docsDir": "docs/ai",
  "files": [
    { "phase": "requirements", "path": "docs/ai/requirements/2026-05-24-feature-user-authentication.md" }
  ]
}
```

Internal interfaces:
- Add `copyFeatureDocTemplates(featureName, { date, phases })` to `TemplateManager`.
- Preflight all target paths before writing. If any target exists, fail with the conflicting paths and write nothing.
- Reuse `normalizeFeatureName` and validation logic from lint or move shared feature-name utilities out of lint rules if the import boundary becomes awkward.

## Component Breakdown
- `packages/cli/src/commands/docs.ts`
  - Registers/implements `docs init-feature`.
  - Handles UI output, process exit codes, options, docs dir, and configured phases.
- `packages/cli/src/lib/TemplateManager.ts`
  - Adds feature-doc creation for the phase list passed by the command.
  - Ensures target phase directories exist.
  - Refuses to overwrite and performs conflict preflight before any write.
- `packages/cli/src/util/date.ts` or local helper
  - Formats local date as `YYYY-MM-DD`.
- `packages/cli/src/services/lint/rules/feature-docs.rule.ts`
  - Keeps resolver compatibility with date-prefixed and legacy docs for configured phases.
- `packages/cli/templates/commands/*.md` and `commands/*.md`
  - Update new-requirement flow to run the CLI initializer.
  - Update follow-up commands to consume selected/generated paths.

## Design Decisions
- Prefer `docs init-feature` because it names the filesystem action and stays separate from agent workflow commands.
- Keep legacy support because installed skills and existing projects are static and can lag CLI releases.
- Default to fail-on-existing before writing any files to avoid losing human-written docs and avoid partial initialization.
- Include `--json` in the first version because the primary caller may be an agent or script that needs exact generated paths.
- Inherit docs directory from project configuration; do not expose a docs-dir override on this command.
- Use local date rather than UTC date to match the user's current working date.
- Use configured phases rather than a hardcoded feature-doc phase list so docs initialization, install configuration, and lint stay aligned.
- Keep migration out of scope; migration can be added later as an explicit command.

Alternatives considered:
- Prompt-only date guidance: simplest but cannot guarantee correctness.
- Modification-time sorting: fragile across clone/copy operations.
- Date prefix without CLI command: improves ordering but still leaves agents responsible for date and naming consistency.

## Non-Functional Requirements
- Reliability: command must either create all expected docs or clearly report what was not created.
- Safety: no overwrite unless explicitly requested.
- Backward compatibility: legacy docs remain valid for lint and follow-up workflows.
- Testability: date source must be deterministic in tests.
- Usability: output should be concise and easy for agents to parse.
