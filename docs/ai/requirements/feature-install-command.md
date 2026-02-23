---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
feature: install-command
---

# Requirements & Problem Understanding - Install Command

## Problem Statement

**What problem are we solving?**

- `ai-devkit init --template` can bootstrap from a file, but there is no dedicated command to apply project setup from an existing `.ai-devkit.json` in one step.
- Users who clone a repository with `.ai-devkit.json` still need to run multiple setup steps manually (phases, commands, skills).
- Teams need a repeatable, non-interactive way to reinstall AI DevKit assets in a project after checkout, cleanup, or machine changes.

**Who is affected by this problem?**

- Developers onboarding into existing repositories.
- Maintainers who want deterministic setup instructions (`npx ai-devkit install`).
- CI/local automation scripts that need idempotent re-setup.

**What is the current situation/workaround?**

- Run `ai-devkit init` with prompts or template path.
- Run separate `ai-devkit skill add ...` commands.
- Manually verify command and phase files exist.

## Goals & Objectives

**What do we want to achieve?**

**Primary goals:**

- Add `npx ai-devkit install` command.
- Command reads `.ai-devkit.json` from current working directory.
- Install/reconcile project artifacts from config in a single run:
  - Environment command/context files.
  - Initialized phase templates.
  - Skills declared in config.
- Ensure `ai-devkit skill add` updates `.ai-devkit.json` so skills become part of installable project state.
- Keep behavior non-interactive by default for automation.

**Secondary goals:**

- Provide clear per-step summary (installed, skipped, failed).
- Make command safe to rerun (idempotent with overwrite policy).
- Reuse existing internals from `init`, `phase`, and `skill add` where possible.

**Non-goals (explicitly out of scope):**

- Replacing `init` command workflows.
- Adding remote config download/registry for `.ai-devkit.json`.
- Installing global commands (`setup --global`) as part of this feature.

## User Stories & Use Cases

**How will users interact with the solution?**

1. As a developer, I want to run `npx ai-devkit install` so my project is configured from `.ai-devkit.json` without prompts.
2. As a team lead, I want setup to be reproducible from committed config so every teammate gets the same result.
3. As a CI maintainer, I want idempotent install behavior so repeated runs do not fail on existing files.

**Key workflows and scenarios:**

- `.ai-devkit.json` exists with environments, initialized phases, and skills metadata -> command installs all.
- Some artifacts already exist -> command prompts for confirmation, then overwrites when confirmed.
- Config is partial -> command installs available sections and reports skipped sections.

**Edge cases to consider:**

- `.ai-devkit.json` missing.
- Invalid JSON/schema mismatch.
- Unsupported environment or phase codes in file.
- Skill install failure due to registry/network issues.
- Partial success across phases/skills.

## Success Criteria

**How will we know when we're done?**

- [x] `ai-devkit install` command is available and documented.
- [x] Command loads `.ai-devkit.json` from CWD by default.
- [x] Command applies configured environments (command/context templates).
- [x] Command applies configured `phases` templates.
- [x] Command installs configured skills using existing skill installation flow.
- [x] Command prints final summary with installed/skipped/failed counts.
- [x] Command returns non-zero exit code for invalid/missing config.
- [x] Command returns exit code `0` for partial skill-install failures and emits warnings with failure details.
- [x] Re-running command is safe and does not duplicate work.
- [x] `ai-devkit skill add` persists installed skill metadata into `.ai-devkit.json`.
- [x] Existing artifacts trigger user confirmation before overwrite.

## Constraints & Assumptions

**What limitations do we need to work within?**

**Technical constraints:**

- Existing `.ai-devkit.json` schema currently stores environments and phases; this feature extends it to persist project skills.
- Skill installation depends on registry/network availability and local cache state.
- Must keep compatibility with existing config files.

**Assumptions:**

- Repositories using `ai-devkit install` commit a valid `.ai-devkit.json`.
- Skills are represented in config as `skills: [{ registry, name }]` and are updated when `ai-devkit skill add` succeeds.
- Existing template managers remain the source of truth for file generation.

## Questions & Open Items

**What do we still need to clarify?**

- None for Phase 3 design review.
