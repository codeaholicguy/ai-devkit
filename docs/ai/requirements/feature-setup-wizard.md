---

## phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria

# Requirements & Problem Understanding

## Problem Statement

**What problem are we solving?**

- `ai-devkit setup` currently requires `--global` and only covers a narrow command-copy path, which creates friction and confusion.
- Users must understand tool-specific layouts (Codex, Claude Code, Antigravity, etc.) before they can become productive.
- Setup of global assets is fragmented across commands, docs, and manual copy steps (`commands`, `skills`, instruction files like `AGENTS.md` or `CLAUDE.md`).
- The current flow does not proactively recommend a practical baseline for engineers who use multiple AI coding agents.

## Goals & Objectives

**What do we want to achieve?**

- Primary goals
  - Turn `npx ai-devkit setup` into a guided interactive wizard by default (no required `--global` gate).
  - Configure local global environments for supported tools in one run (for example: Codex, Claude Code, Antigravity).
  - Support setup of global assets: commands, skills, and instruction/context files where each tool supports them.
  - Make setup idempotent, re-runnable, and safe (preview + backup + overwrite policy).
  - Provide actionable recommendations based on user profile (solo developer, team member, power user).
- Secondary goals
  - Add non-interactive mode for CI or scripted onboarding.
  - Add a generated setup report summarizing what was changed and what still needs manual action.
  - Establish a capability model so new tools can be added without rewriting setup logic.
- Non-goals (what's explicitly out of scope)
  - Building full remote skill search/indexing in this feature (tracked separately by skill discovery/search features).
  - Replacing each tool's native auth/login flows.
  - Enforcing enterprise policy management end-to-end in v1 (this can be layered later).

## User Stories & Use Cases

**How will users interact with the solution?**

- As a new user, I want one guided setup wizard so that I can get started without learning every tool's folder conventions.
- As a multi-tool user, I want to configure Codex and Claude Code in one flow so that my prompts/skills/instructions are consistent.
- As a team member, I want a recommended "team baseline profile" so that our setup is standardized but still customizable.
- As a power user, I want `--dry-run`, diff preview, and non-interactive flags so that I can automate setup safely.
- As a returning user, I want re-running setup to be fast and safe so that I can update assets without breaking my custom files.
- Key workflows and scenarios
  - Run `npx ai-devkit setup` -> choose persona/profile -> select tools -> choose assets -> preview -> apply -> report.
  - Run `npx ai-devkit setup --non-interactive --profile team-default` for deterministic onboarding.
  - Run setup again after upgrading ai-devkit -> detect drift -> apply selective updates.
- Edge cases to consider
  - Tool installed but config directory missing.
  - Existing modified user files conflict with new templates.
  - Unsupported OS path conventions.
  - Partial permissions failures (some assets succeed, others fail).
  - Offline mode when setup requires remote registry/template metadata.

## Success Criteria

**How will we know when we're done?**

- Measurable outcomes
  - First-time wizard completion under 5 minutes for a common 2-tool setup.
  - 90%+ of users can complete setup without reading external docs.
  - Re-run setup changes only drifted files (idempotent behavior).
- Acceptance criteria
  - `npx ai-devkit setup` launches wizard by default.
  - Wizard supports at least Codex, Claude Code, and Antigravity in v1.
  - User can select assets by type (`commands`, `skills`, instruction docs) per tool.
  - Wizard shows planned file operations before writing.
  - Wizard provides backup/overwrite options and a clear final report.
  - Non-interactive mode is supported for scripted usage.
- Performance benchmarks (if applicable)
  - Interactive startup and environment detection under 2s on a warm local machine.
  - Dry-run planning under 1s for previously known setup state.

## Constraints & Assumptions

**What limitations do we need to work within?**

- Technical constraints
  - Different tools use different config scopes and file formats.
  - Setup must work across macOS/Linux/Windows path conventions.
  - Setup should avoid destructive writes by default.
- Business constraints
  - Keep existing command behavior backwards compatible enough to avoid breaking current scripts.
  - Keep onboarding simple for first-time users while preserving advanced controls.
- Time/budget constraints
  - v1 should prioritize high-impact capabilities over full policy engine support.
- Assumptions we're making
  - Users have write access to their home config directories.
  - Official/default config paths for tools remain stable or can be versioned in adapters.
  - Most users accept a profile-driven setup approach if they can opt out per step.

## Questions & Open Items

**What do we still need to clarify?**

- Should setup default to applying a "minimal safe baseline" (commands + instruction file) or ask every asset explicitly?
- Should global skill installation use symlinks, copies, or a managed manifest + sync strategy?
- Should we store setup state in a global ai-devkit config file for drift detection?
- How aggressively should we prompt users to adopt recommended defaults vs "expert mode" controls?
- Should migration of existing `setup --global` users be automatic or require explicit consent the first time?

