---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

**What problem are we solving?**

- Users want to install skills from personal or organization-specific registries.
- Current skill commands only use the default registry source, forcing users to fork or modify it.
- Teams cannot seamlessly share internal skills without changing core defaults.

## Goals & Objectives

**What do we want to achieve?**

- Allow multiple custom registries configured in a global `.ai-devkit.json`.
- Use the same registry format as `skills/registry.json` (a `registries` map).
- Merge default and custom registries for all skill commands.
- Prioritize local (custom) registry entries over default when registry IDs conflict.
- Support offline usage by relying on cached registry clones when available.
- Keep the user experience seamless (no registry origin display in lists).
- Non-goals:
  - Authentication or credential management for private registries
  - UI for registry management
  - Changing registry formats beyond the existing `registries` map

## User Stories & Use Cases

**How will users interact with the solution?**

- As a developer, I want to configure multiple custom registries so I can install my own skills.
- As an organization admin, I want to define internal registries so my team can share private skills.
- As a user, I want skill commands to work the same way while searching and installing across all registries.
- As a user, I want custom registries to override defaults if the registry ID is the same.
- As a user, I want skill commands to work offline if registries are already cached.
- Edge cases:
  - Registry ID conflict between custom and default
  - Network unavailable but cache exists
  - Registry exists but skill is missing

## Success Criteria

**How will we know when we're done?**

- `ai-devkit skill` commands (add/list/remove/update/search, etc.) use merged registries.
- Custom registries can be configured as multiple entries in global `.ai-devkit.json`.
- Registry ID conflicts resolve in favor of the custom registry.
- Offline flows succeed when cached registries exist.
- Clear error messages are shown for missing registries or skills.
- Tests cover merging behavior, overrides, and offline cache usage.

## Constraints & Assumptions

**What limitations do we need to work within?**

- Custom registries use the same structure as `skills/registry.json`.
- Registries are Git repositories that contain `skills/<skillName>/SKILL.md`.
- User manages any authentication externally; CLI only clones locally.
- Git must be installed for cloning.
- Cached registries live under `~/.ai-devkit/skills`.
- Global config file location: `~/.ai-devkit/.ai-devkit.json`.

## Questions & Open Items
**What do we still need to clarify?**

- None at this time.
