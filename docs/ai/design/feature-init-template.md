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
    User -->|init --template| InitCommand
    InitCommand --> TemplateLoader
    TemplateLoader --> TemplateValidator
    TemplateValidator --> InitConfigurator
    InitConfigurator --> EnvConfigurator[Environment Configurator]
    InitConfigurator --> PhaseConfigurator[Phase Configurator]
    InitConfigurator --> SkillInstaller[Skill Installer Bridge]
    SkillInstaller --> SkillAdd[Existing skill add flow]
    InitConfigurator --> Reporter
  ```
- Key components and their responsibilities
  - `InitCommand`: reads CLI args and routes interactive vs template-driven flow.
  - `TemplateLoader`: reads template file from path and parses YAML/JSON.
  - `TemplateValidator`: validates schema for `environments`, `skills`, and `phases`.
  - `InitConfigurator`: orchestrates applying resolved values.
  - `SkillInstaller Bridge`: adapts template skill entries into `skill add` invocations.
  - `Reporter`: prints summary of applied config + skill install results.
- Technology stack choices and rationale
  - Continue with existing Node/TypeScript CLI stack.
  - Reuse current argument parsing and prompt layers.
  - Reuse existing `skill add` domain logic to avoid duplicated install behavior.

## Data Models
**What data do we need to manage?**

- Core entities and their relationships
  - `InitTemplate`
  - `TemplateSkill`
  - `TemplateValidationResult`
  - `SkillInstallResult`
- Data schemas/structures
  - `InitTemplate`
    - `{ version?, environments?, phases?, skills? }`
  - `TemplateSkill`
    - `{ registry: string, skill: string, options?: Record<string, string> }`
  - Skill entry processing key
    - Unique key is `registry + skill`; same registry with different skills is valid and processed as separate installs.
  - `SkillInstallResult`
    - `{ registry, skill, status: 'installed' | 'skipped' | 'failed', reason? }`
- Data flow between components
  - CLI args -> template file parse -> validation -> init apply -> per-skill install -> summary output.

## API Design
**How do components communicate?**

- External APIs (if applicable)
  - None required; optional network access occurs only through existing skill installation behavior.
- Internal interfaces
  - `loadTemplate(path: string): Promise<unknown>` (supports relative and absolute paths)
  - `validateTemplate(raw: unknown): TemplateValidationResult`
  - `applyTemplate(config: InitTemplate): Promise<InitApplyResult>`
  - `installSkills(skills: TemplateSkill[]): Promise<SkillInstallResult[]>`
- Request/response formats
  - CLI command
    - `npx ai-devkit init --template <path>`
    - Path resolution: absolute path as-is; relative path resolved from current working directory.
  - Sample YAML template
    ```yaml
    version: 1
    environments:
      - codex
      - claude
    phases:
      - requirements
      - design
      - planning
      - implementation
      - testing
    skills:
      - registry: codeaholicguy/ai-devkit
        skill: debug
      - registry: codeaholicguy/ai-devkit
        skill: memory
    ```
  - Output
    - Validation errors include template path + invalid field(s).
    - Success summary includes configured environments/phases and skill outcomes.
    - Skill installation failures are warnings; command exits with code `0` and includes failed items in report.
- Authentication/authorization approach
  - No new auth model. Skill installation uses current auth/network behavior in existing `skill add` flow.

## Component Breakdown
**What are the major building blocks?**

- Frontend components (if applicable)
  - CLI prompt layer remains as fallback when template is partial.
- Backend services/modules
  - `init.command` argument handling (`--template`).
  - `template-parser` module.
  - `template-validator` module.
  - `init-apply` orchestration module.
  - `skill-install-adapter` module (bridge to existing install logic).
- Database/storage layer
  - No new persistent store required for v1.
- Third-party integrations
  - YAML parser library (existing or new lightweight dependency).

## Design Decisions
**Why did we choose this approach?**

- Key architectural decisions and trade-offs
  - Reuse `skill add` implementation:
    - Pros: consistent behavior and less duplication.
    - Cons: init flow depends on skill module API stability.
  - Add template as optional mode, not replacement:
    - Pros: backward compatibility and low migration risk.
    - Cons: dual paths increase test surface.
  - Continue-on-error for skill install with exit code `0`:
    - Pros: init can apply as much as possible and provide complete failure report in one run.
    - Cons: downstream automation must inspect warning/report output instead of relying only on exit code.
  - Validate template before applying side effects:
    - Pros: deterministic behavior and better errors.
    - Cons: requires explicit schema maintenance.
- Alternatives considered
  - Implement separate installer inside `init`.
    - Rejected due to divergence from `skill add` behavior.
  - Force non-interactive mode whenever template provided.
    - Rejected; fallback prompts for missing values are more user-friendly.
- Patterns and principles applied
  - Schema-first validation.
  - Orchestrator + adapters for integration points.
  - Backward-compatible CLI extension.

## Non-Functional Requirements
**How should the system perform?**

- Performance targets
  - Template loading + validation under 300ms for small files.
  - No regression in plain interactive init startup.
- Scalability considerations
  - Support multiple skill entries without blocking summary reporting.
- Security requirements
  - Treat template input as untrusted; validate and sanitize fields before use.
  - Avoid arbitrary command execution from template values.
- Reliability/availability needs
  - Partial failure handling for multi-skill installs with explicit status.
  - Duplicate `registry + skill` entries are deduplicated during execution and reported as skipped/warning.
  - Deterministic error codes for invalid template input.
