---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

**What problem are we solving?**

- `npx ai-devkit init` currently requires interactive step-by-step prompts, which slows down repeatable setup and automation.
- Teams and power users cannot define a reusable bootstrap configuration that includes environments, phases, and skills in one command.
- Skill installation during init is not fully declarative from a single template file.
- Who is affected:
  - Users onboarding multiple projects with similar AI DevKit setup.
  - Teams that want a standardized, versioned bootstrap config.
  - CI/bootstrap scripts that need non-interactive initialization.

## Goals & Objectives

**What do we want to achieve?**

- Primary goals
  - Add support for `npx ai-devkit init --template <file>` (example: `npx ai-devkit init --template test.yaml`).
  - Allow template-driven initialization for:
    - `environments`
    - `skills` (`registry`, `skill`)
    - `phases`
  - Automatically install requested skills via `npx ai-devkit skill add` during init.
  - Reduce or eliminate interactive prompts when a valid template provides required values.
- Secondary goals
  - Keep backward compatibility for current interactive `init` flow.
  - Produce clear output for applied template values and skill install results.
- Non-goals (what's explicitly out of scope)
  - Defining a remote template registry in this phase.
  - Supporting template generation/editing UI.
  - Writing a resolved template config/lock manifest after init.
  - Reworking unrelated init behavior not covered by template input.

## User Stories & Use Cases

**How will users interact with the solution?**

- As a developer, I want to run `npx ai-devkit init --template test.yaml` so that I can initialize without answering prompts one by one.
- As a team lead, I want to commit a template file so that every teammate gets the same environments, skills, and phases.
- As a CI maintainer, I want deterministic initialization from template so that pipeline setup is reproducible.
- Key workflows and scenarios
  - Local bootstrap from YAML or JSON template file path (relative or absolute path).
  - Template contains skill entries and init installs them automatically using existing skill-add command behavior.
  - Template can include multiple skills from the same registry (for example `codeaholicguy/ai-devkit` with `debug` and `memory`).
  - Partial template: use template values first, then prompt only for missing required values.
- Edge cases to consider
  - Template file missing or unreadable.
  - Invalid YAML/JSON schema.
  - Unknown environment/phase/skill fields.
  - `skill add` fails for one or more entries (network, registry, invalid name).
  - Duplicate skill entries or already-installed skills.

## Success Criteria

**How will we know when we're done?**

- Measurable outcomes
  - Template-driven init finishes with zero prompts when all required fields are present.
  - Skill installation success/failure is clearly reported per skill item.
- Acceptance criteria
  - CLI supports `--template <path>` argument on `init`.
  - Template format supports both YAML (`.yml`/`.yaml`) and JSON (`.json`) in v1.
  - Template path accepts both relative and absolute file paths.
  - Init parses template and applies `environments`, `skills`, and `phases`.
  - For each template skill entry, init triggers the same install path as `npx ai-devkit skill add`.
  - Multiple entries with the same registry and different skill names are all processed.
  - Skill installation continues after individual failures and reports all failed items in the final summary.
  - If one or more skills fail, command exits with status code `0` and warning output.
  - Existing `init` command without `--template` behaves as before.
  - Validation errors are actionable and include file path + field context.
- Performance benchmarks (if applicable)
  - Template parse/validation overhead remains negligible (<300ms for typical small templates).

## Constraints & Assumptions

**What limitations do we need to work within?**

- Technical constraints
  - Must integrate into current CLI command architecture for `init` and `skill add`.
  - Template parsing must support YAML and JSON formats.
  - Error handling must keep partial success explicit for multi-skill installs.
- Business constraints
  - Do not break existing onboarding UX for interactive users.
- Time/budget constraints
  - Reuse existing skill installation flow instead of implementing a second installer.
- Assumptions we're making
  - The template schema can be versioned to support future keys.
  - `skill add` has stable programmatic invocation path from init.

## Questions & Open Items

**What do we still need to clarify?**

- None for Phase 2 review.
