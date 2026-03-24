---
phase: requirements
title: Display CWD in Agent List Command
description: Add a CWD column to the agent list table showing each agent's working directory
---

# Display CWD in Agent List Command

## Problem Statement

When running `ai-devkit agent list`, users see a table with Agent, Type, Status, Working On, and Active columns. However, there is no way to tell **which directory** each agent is working in. This makes it difficult to distinguish between multiple agents of the same type running in different projects.

The `projectPath` field already exists in the `AgentInfo` data model and is populated by adapters, but it is not surfaced in the table output.

## Goals & Objectives

**Primary goals:**
- Display each agent's current working directory (cwd) in the `agent list` table output

**Non-goals:**
- Changing the `--json` output format (it already includes `projectPath`)
- Adding filtering/sorting by cwd
- Modifying how `projectPath` is collected by adapters

## User Stories & Use Cases

- As a developer running multiple agents across projects, I want to see each agent's working directory so I can quickly identify which agent belongs to which project.
- As a developer with agents in nested directories, I want the path displayed in a compact, readable format (shortened with `~` for home directory).

## Success Criteria

- [ ] `agent list` table includes a "CWD" column showing the agent's `projectPath`
- [ ] Long paths are shortened (home directory replaced with `~`)
- [ ] Column is positioned after "Agent" name for quick visual association
- [ ] Existing tests updated to cover the new column
- [ ] No regressions in existing agent list functionality

## Constraints & Assumptions

- The `projectPath` field is already available in `AgentInfo` — no adapter changes needed
- Path shortening uses `os.homedir()` for `~` substitution
- Column styling uses `chalk.dim` to keep focus on agent name and status

## Questions & Open Items

- None — straightforward display addition using existing data.
