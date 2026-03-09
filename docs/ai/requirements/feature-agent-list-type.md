---
phase: requirements
title: "Agent List Type Column"
description: Display agent type (Claude Code, Codex, etc.) in the agent list table output
---

# Requirements: Agent List Type Column

## Problem Statement

When running `ai-devkit agent list`, users see agents listed with Name, Status, Working On, and Active columns. However, the **agent type** (Claude Code, Codex, etc.) is not displayed in the table output, even though the data is already available in the `AgentInfo` model. Users managing multiple agent types cannot quickly distinguish which tool each agent belongs to without using `--json`.

## Goals & Objectives

**Primary goals:**
- Display a human-friendly "Type" column in the `agent list` table output
- Map internal type values to readable labels: `claude` → "Claude Code", `codex` → "Codex", `gemini_cli` → "Gemini CLI", `other` → "Other"

**Non-goals:**
- Changing the AgentType enum or adding new agent types
- Filtering agents by type (future feature)
- Modifying `--json` output (type is already included)

## User Stories & Use Cases

- As a developer running multiple agent types, I want to see each agent's type in the list so I can quickly identify which tool is handling each task.
- As a user with both Claude Code and Codex agents, I want to distinguish them at a glance without resorting to JSON output.

## Success Criteria

- [ ] `ai-devkit agent list` shows a "Type" column as the 2nd column (after Agent)
- [ ] Type labels are human-friendly (not raw enum values)
- [ ] Existing table layout and functionality is preserved
- [ ] All existing tests pass; new tests cover the type column

## Constraints & Assumptions

- The `AgentInfo.type` field is already populated by all adapters
- Table column order: Agent | Type | Status | Working On | Active
- No changes to the data model or adapter layer required

## Questions & Open Items

- None — all information is available from the existing codebase.
