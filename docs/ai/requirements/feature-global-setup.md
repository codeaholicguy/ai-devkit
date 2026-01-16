---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
feature: global-setup
---

# Requirements & Problem Understanding - Global Setup Feature

## Problem Statement
**What problem are we solving?**

- Some AI environments (Antigravity, Codex) support global configuration folders where commands can be stored globally and shared across all projects on the user's machine
- Currently, ai-devkit only supports project-local setup of commands, requiring users to manually copy commands to global folders
- Users want a convenient way to install ai-devkit commands globally during setup

**Who is affected by this problem?**
- Developers who use Antigravity or Codex and want commands available across all their projects without repeating setup

**What is the current situation/workaround?**
- Users must manually copy command files from `templates/commands` to their global environment folders (e.g., `~/.gemini/antigravity/global_workflows/` or `~/.codex/prompts/`)

## Goals & Objectives
**What do we want to achieve?**

**Primary goals:**
- Allow users to install commands globally via a dedicated command option (e.g., `ai-devkit setup --global`)
- Only show environments that support global setup for selection
- Copy command templates to the appropriate global folder for the selected environment(s)

**Secondary goals:**
- Handle existing files gracefully with overwrite prompts
- Design the implementation to be extensible for future environments

**Non-goals (explicitly out of scope):**
- Global setup for context files (AGENTS.md, CLAUDE.md, etc.) - only commands are eligible
- Global setup for phase templates (requirements, design, etc.)
- Auto-detecting which environments a user has installed

## User Stories & Use Cases
**How will users interact with the solution?**

1. **As a developer using Antigravity**, I want to run `ai-devkit setup --global` so that I can have ai-devkit commands available in `~/.gemini/antigravity/global_workflows/` for all my projects.

2. **As a developer using Codex**, I want to run `ai-devkit setup --global` so that I can have ai-devkit commands available in `~/.codex/prompts/` for all my projects.

3. **As a developer**, when running global setup, I want to be shown only environments that support global setup (Antigravity, Codex) and not all environments.

4. **As a developer with existing global commands**, I want to be prompted before overwriting so I don't accidentally lose my customizations.

**Key workflows and scenarios:**
- Run `ai-devkit setup --global` → Select environment(s) → Commands copied to global folder
- Run `ai-devkit setup --global` with existing files → Prompt for overwrite confirmation

**Edge cases to consider:**
- Global folder doesn't exist yet (should be created)
- User has customized commands in global folder (prompt before overwrite)
- User selects an environment without global support (shouldn't be possible with filtered list)
- Home directory is inaccessible (should display clear error message)
- Write permissions fail (should display clear error with suggested fix)

## Success Criteria
**How will we know when we're done?**

- [ ] Running `ai-devkit setup --global` shows only environments with global support enabled
- [ ] Selecting an environment copies all command templates to its global folder
- [ ] Commands are copied with correct file extensions:
  - Antigravity: `.md` format (same as local `.agent/workflows/`)
  - Codex: `.md` format
- [ ] If files exist, user is prompted for overwrite confirmation
- [ ] Global folders are created if they don't exist
- [ ] Clear success/error messages are displayed (including permission errors)

## Constraints & Assumptions
**What limitations do we need to work within?**

**Technical constraints:**
- Must use `os.homedir()` and `path.join()` for cross-platform home directory resolution (works on macOS, Linux, Windows)
- Only Antigravity and Codex are enabled for global setup initially

**Assumptions:**
- Users have write access to their home directory
- The global folder paths are correct:
  - Antigravity: `~/.gemini/antigravity/global_workflows/` (uses `.md` format)
  - Codex: `~/.codex/prompts/` (uses `.md` format)

## Questions & Open Items
**What do we still need to clarify?**

- [x] Should this be a separate command? → **Yes, `ai-devkit setup --global`**
- [x] Correct global path for Antigravity? → **`~/.gemini/antigravity/global_workflows/`**
- [x] Overwrite behavior? → **Prompt for confirmation if files exist**
- [x] Future extensibility? → **Yes, other environments may be added later**
