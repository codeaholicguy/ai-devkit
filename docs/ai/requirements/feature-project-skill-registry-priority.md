---
phase: requirements
title: Requirements & Problem Understanding
description: Add project-level registry source with deterministic precedence for skill installation
---

# Requirements & Problem Understanding

## Problem Statement
- Skill installation currently resolves registries from default remote registry plus global config (`~/.ai-devkit/.ai-devkit.json`).
- Teams need project-specific overrides in repository config so installs are reproducible across contributors and CI.
- Without project-level override, users must edit global state and cannot keep registry decisions version-controlled.

## Goals & Objectives
- Add project `.ai-devkit.json` as an additional registry source for skill installation.
- Enforce deterministic conflict precedence: `project > global > default`.
- Preserve backward compatibility for existing projects and global-only users.

## Non-Goals
- Redesigning the entire `.ai-devkit.json` schema.
- Changing non-install commands that do not rely on registry resolution.
- Introducing remote registry auth or secret management.

## User Stories & Use Cases
- As a project maintainer, I can define custom registry mappings in project config so all contributors use the same registry source.
- As a developer with personal global overrides, project overrides still win inside that repository.
- As an existing user with only global config, behavior remains unchanged.

## Success Criteria
- `ai-devkit skill add` reads registry maps from project config, global config, and default registry.
- On key collision, selected URL follows `project > global > default`.
- Unit tests cover precedence and parsing behavior.

## Constraints & Assumptions
- Current runtime already reads `.ai-devkit.json` via `ConfigManager`.
- Project configs may contain either root `registries` or nested `skills.registries`; both should be accepted for resilience.
- Invalid non-string entries are ignored.

## Questions & Open Items
- None blocking for implementation.
