---
phase: requirements
title: Local registry bare-dot source (#419)
description: skill add-registry must treat existing directories (including ".") as live local registries, not git remotes
---

# Requirements — #419

## Problem

`ai-devkit skill add-registry <id> .` inside a git repository must register the current directory as a live local skill registry. It must not `git clone` into `~/.ai-devkit/skills/<id>/`, which drops untracked files and uncommitted edits and breaks link-mode installs.

## Success criteria

- Bare `.`, plain relative directory names, and `~` shorthands resolve to absolute `file://` sources when the path exists on disk.
- Only URL-shaped or nonexistent scheme-less paths are handed to git.
- Persisted registry sources remain valid when read from config (not tied to call-time `cwd`).

## Out of scope

- Changing registry layout or `./skills`-parent validation beyond current `prepareLocalRegistry` checks.