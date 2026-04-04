---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
feature: skill-add-interactive-selection
---

# Requirements & Problem Understanding - Skill Add Interactive Selection

## Problem Statement
**What problem are we solving?**

- `ai-devkit skill add` currently requires both `<registry-repo>` and `<skill-name>`, even when the user already knows the registry but not the exact skill identifier.
- Users installing from a registry often need a discovery step before installation, so they must leave the CLI and inspect the registry manually.
- This creates friction for first-time installs and makes the add flow inconsistent with the rest of the CLI, which already uses interactive prompts in several commands.

**Who is affected by this problem?**

- Developers using `ai-devkit skill add <registry>` without knowing the exact skill name.
- Teams exposing many skills from a private or custom registry.
- New users evaluating available skills before installation.

**What is the current situation/workaround?**

- Users must inspect the registry repository manually and identify the skill folder name under `skills/<skill-name>`.
- If they omit the skill name, the command fails at CLI argument parsing instead of helping them continue interactively.

## Goals & Objectives
**What do we want to achieve?**

**Primary goals:**

- Allow `ai-devkit skill add <registry>` to enter an interactive selection flow when `<skill-name>` is omitted.
- Build the selectable list from the requested registry itself, not from a hardcoded list.
- Reuse the existing installation path once the user selects one or more skills.
- Keep the existing explicit flow `ai-devkit skill add <registry> <skill-name>` unchanged.

**Secondary goals:**

- Show clear, user-friendly errors when the registry is missing, empty, or cannot be read.
- Support the same registry sources already supported by `SkillManager` (default, global custom, project custom, cached).
- Keep the selection labels descriptive enough for users to distinguish similar skills.

**Non-goals (explicitly out of scope):**

- Fuzzy search across all registries in the add flow.
- Changing `skill find` behavior.
- Adding a new registry metadata format.

## User Stories & Use Cases
**How will users interact with the solution?**

1. As a developer, I want to run `ai-devkit skill add my-org/skills` so I can choose one or more skills interactively when I do not remember the exact skill names.
2. As a developer, I want the CLI to show the actual skills available in that registry so I can install several of them without opening GitHub.
3. As an automation user, I want `ai-devkit skill add <registry> <skill-name>` to keep working non-interactively so existing scripts do not break.

**Key workflows and scenarios:**

- User runs `ai-devkit skill add <registry>` in a TTY:
  - CLI validates the registry.
  - CLI fetches or reuses the cached registry repository.
  - CLI extracts available skills from `skills/*/SKILL.md`.
  - CLI shows an interactive multi-selection list, even if the registry only exposes one valid skill.
  - CLI installs each selected skill using the existing add flow.
- User runs `ai-devkit skill add <registry> <skill-name>`:
  - Existing direct install flow continues with no interactive prompt.
- User cancels the prompt:
  - CLI exits without installing anything and reports cancellation clearly.
- Registry refresh fails but a cached copy exists:
  - CLI warns and uses the cached registry contents to build the selection list.

**Edge cases to consider:**

- Registry ID does not exist and is not cached.
- Registry exists but contains no valid skills.
- Registry contains directories without `SKILL.md`.
- Prompt is triggered in a non-interactive environment.
- Cached registry is stale or update fails before enumeration.

## Success Criteria
**How will we know when we're done?**

- `ai-devkit skill add <registry>` is accepted by the CLI.
- When run interactively, the command displays a selection list populated from the target registry.
- The command still shows the selection list when the registry contains exactly one valid skill.
- Selecting one or more skills installs each of them through the existing installation path and updates project config exactly as today.
- `ai-devkit skill add <registry> <skill-name>` continues to work without prompting.
- Invalid, empty, and non-interactive cases return actionable error messages.
- If registry refresh fails but a cached copy exists, the command warns and uses the cached list.
- Automated tests cover direct install, interactive selection, cancellation, empty registry, and non-TTY behavior.

## Constraints & Assumptions
**What limitations do we need to work within?**

**Technical constraints:**

- Registry resolution must remain consistent with existing merged registry behavior.
- Skill discovery should rely on the registry repository structure already assumed elsewhere: `skills/<skill-name>/SKILL.md`.
- The feature should reuse the current `inquirer` dependency rather than adding a new prompt library.

**Assumptions:**

- The selected registry is either configured remotely or already available in the local cache.
- Skill folder names remain the install identifiers.
- Description text can be derived from `SKILL.md` when available, or omitted/fallback when not available.
- If a skill name is explicitly provided in the command, direct installation remains the highest-priority path.

## Questions & Open Items
**What do we still need to clarify?**

- None for Phase 2 review. The prompt uses a multi-select list whenever `<skill-name>` is omitted, and cached registry content is acceptable when refresh fails.
