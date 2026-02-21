---
phase: design
title: System Design & Architecture
description: Define the technical architecture, components, and data models
---

# System Design & Architecture

## Architecture Overview
**What is the high-level system structure?**

- Include a mermaid diagram that captures the main components and their relationships. Example:
  ```mermaid
  graph TD
    User -->|CLI| SetupWizard
    SetupWizard --> Detector[Environment Detector]
    SetupWizard --> ProfileEngine[Profile Recommender]
    SetupWizard --> Planner[Plan Builder]
    Planner --> Adapters[Tool Adapters]
    Adapters --> FileOps[Safe File Ops]
    FileOps --> ToolDirs[Global Tool Directories]
    Planner --> StateStore[Setup State + Manifest]
    SetupWizard --> Reporter[Result Reporter]
  ```
- Key components and their responsibilities
  - SetupWizard: orchestrates interactive and non-interactive flows.
  - Environment Detector: discovers installed/supported tools and existing global configs.
  - Profile Recommender: proposes setup defaults by user persona (quickstart, team baseline, custom).
  - Plan Builder: computes deterministic operations (`create`, `update`, `skip`, `backup`).
  - Tool Adapters: map tool capabilities and paths (commands/skills/instruction files).
  - Safe File Ops: apply with backup, dry-run preview, conflict handling, and rollback boundaries.
  - State Store: keeps setup metadata for idempotency and drift detection.
  - Reporter: prints result summary and next-step recommendations.
- Technology stack choices and rationale
  - Node/TypeScript to align with current CLI architecture.
  - Reuse existing prompt UI (`inquirer` and terminal-ui abstractions) for consistent UX.
  - Adapter-based design to avoid hardcoded branching and simplify future tool expansion.

## Data Models
**What data do we need to manage?**

- Core entities and their relationships
  - ToolAdapter: describes capabilities and paths for one environment.
  - SetupProfile: predefined recommendation set (assets + policies).
  - SetupPlan: resolved operations generated from user choices + current state.
  - SetupState: persisted metadata from prior setup runs.
  - SetupReport: structured outcome summary of applied/skipped/failed operations.
- Data schemas/structures
  - `ToolAdapter`
    - `{ code, name, capabilities: { globalCommands, globalSkills, globalInstructionFile }, paths, formats }`
  - `SetupPlan`
    - `{ id, createdAt, toolSelections, operations[], backupPolicy, overwritePolicy, dryRun }`
  - `Operation`
    - `{ type, source, target, assetType, toolCode, strategy, status, reason? }`
  - `SetupState`
    - `{ version, lastRunAt, fingerprintsByTarget, selectedProfile, selectedTools }`
- Data flow between components
  - Detector -> Profile Recommender -> Plan Builder -> Safe File Ops -> State Store -> Reporter.

## API Design
**How do components communicate?**

- External APIs (if applicable)
  - No mandatory external API calls in v1 core flow.
  - Optional future metadata refresh may use registry endpoints if online.
- Internal interfaces
  - `detectEnvironments(): DetectedEnvironment[]`
  - `recommendProfiles(context): SetupProfile[]`
  - `buildPlan(input): SetupPlan`
  - `applyPlan(plan): SetupReport`
  - `renderReport(report): void`
- Request/response formats
  - CLI entry points
    - `npx ai-devkit@latest setup` (interactive wizard default)
    - `npx ai-devkit@latest setup --non-interactive --profile <name> --tools codex,claude --assets commands,skills`
    - `npx ai-devkit@latest setup --dry-run`
    - `npx ai-devkit@latest setup --doctor` (recommended extension for diagnostics)
  - Output
    - Human-readable summary by default.
    - Optional machine-readable JSON report (`--json`) for CI/auditing.
- Authentication/authorization approach
  - Setup writes only to user-accepted paths.
  - No secret material stored in setup state.
  - Existing auth for each tool remains managed by that tool.

## Component Breakdown
**What are the major building blocks?**

- Frontend components (if applicable)
  - Terminal wizard screens: welcome, profile selection, tool selection, asset selection, preview, apply, summary.
- Backend services/modules
  - `SetupWizardService`
  - `EnvironmentDetector`
  - `ProfileRecommendationService`
  - `SetupPlanner`
  - `SetupExecutor`
  - `SetupStateRepository`
  - `SetupReporter`
- Database/storage layer
  - Local state file under user config/cache path (for example `~/.ai-devkit/setup-state.json`).
  - Backup snapshots with timestamps when overwrite policy requires backup.
- Third-party integrations
  - Tool path conventions from Codex/Claude/Antigravity adapter definitions.
  - Optional shells for environment checks where required.

## Design Decisions
**Why did we choose this approach?**

- Key architectural decisions and trade-offs
  - Make wizard the default instead of requiring `--global`:
    - Pros: better discoverability, lower onboarding friction.
    - Cons: users who prefer scripts need explicit non-interactive flags.
  - Use capability-driven adapters instead of tool-specific branching:
    - Pros: scalable for new tools and clearer testability.
    - Cons: initial refactor overhead.
  - Use plan/apply workflow with dry-run:
    - Pros: safer writes, auditable operations, easier debugging.
    - Cons: slightly more implementation complexity.
  - Keep idempotent state + fingerprints:
    - Pros: fast reruns, accurate drift detection.
    - Cons: need robust state migration/versioning.
  - Keep setup local-first (no required network):
    - Pros: reliable and fast.
    - Cons: recommendations may be less dynamic without optional online metadata.
- Alternatives considered
  - Keep `setup --global` and add more flags:
    - Rejected: scales poorly as feature matrix grows.
  - One-off shell scripts per tool:
    - Rejected: difficult to maintain and non-portable.
  - Full policy engine in v1:
    - Deferred: high complexity for limited initial user value.
- Patterns and principles applied
  - Progressive disclosure (quick path vs advanced mode).
  - Idempotent infrastructure-like planning/apply model.
  - Fail-soft execution: partial success with explicit report.

## Non-Functional Requirements
**How should the system perform?**

- Performance targets
  - Startup detection and wizard initialization under 2s for typical local setups.
  - Dry-run planning under 1s with warm state.
- Scalability considerations
  - Adapter registry should support 10+ environments without major UX degradation.
  - File operation engine should handle large command/skill templates predictably.
- Security requirements
  - Never write outside approved user paths.
  - Never overwrite without policy confirmation.
  - Never persist secrets in state, logs, or reports.
- Reliability/availability needs
  - Each operation isolated; one tool failure should not corrupt others.
  - Backup and recoverable operations for overwrite scenarios.
  - Clear actionable failure messages with remediation steps.

