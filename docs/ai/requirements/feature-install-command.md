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
- Some artifacts already exist -> command skips or overwrites based on flags/policy and reports actions.
- Config is partial -> command installs available sections and reports skipped sections.

**Edge cases to consider:**

- `.ai-devkit.json` missing.
- Invalid JSON/schema mismatch.
- Unsupported environment or phase codes in file.
- Skill install failure due to registry/network issues.
- Partial success across phases/skills.

## Success Criteria

**How will we know when we're done?**

- [ ] `ai-devkit install` command is available and documented.
- [ ] Command loads `.ai-devkit.json` from CWD by default.
- [ ] Command applies configured environments (command/context templates).
- [ ] Command applies configured `initializedPhases` templates.
- [ ] Command installs configured skills using existing skill installation flow.
- [ ] Command prints final summary with installed/skipped/failed counts.
- [ ] Command returns non-zero exit code for invalid/missing config, and configurable behavior for partial install failures.
- [ ] Re-running command is safe and does not duplicate work.

## Constraints & Assumptions

**What limitations do we need to work within?**

**Technical constraints:**

- Existing `.ai-devkit.json` schema currently stores environments and phases, but not explicit project skill list.
- Skill installation depends on registry/network availability and local cache state.
- Must keep compatibility with existing config files.

**Assumptions:**

- Repositories using `ai-devkit install` commit a valid `.ai-devkit.json`.
- Skills can be represented in config via a new optional field without breaking old files.
- Existing template managers remain the source of truth for file generation.

## Questions & Open Items

**What do we still need to clarify?**

- [ ] Confirm canonical schema for persisted skills in `.ai-devkit.json` (for example `skills: [{ registry, name }]`).
- [ ] Decide default overwrite strategy when artifacts already exist (`skip` vs `overwrite`, and optional flags).
- [ ] Decide exit code policy when only some skills fail (strict vs warning-only mode).
