---
phase: requirements
title: Requirements & Problem Understanding
description: Add a CLI command that persists third-party skill registries
---

# Requirements & Problem Understanding

## Problem Statement

AI DevKit users can consume registries configured in `.ai-devkit.json`, but there is no CLI command for registering one. Users must hand-edit JSON, know the nested `registries` schema, and choose the correct project or global config file. This is error-prone and makes documented CLI workflows incomplete.

The feature is for users who want `skill add`, `find`, `update`, and `rebuild-index` to resolve a third-party registry through the existing default < global < project merge order.

## Goals & Objectives

- Add exactly one flat command: `ai-devkit skill add-registry <id> <url>`.
- Write project config by default and global config with `-g, --global`.
- Validate only the registry ID with the existing `validateRegistryId()` rule (`org/repo`).
- Preserve the URL string verbatim without URL parsing, normalization, network verification, or format restrictions.
- Merge the new entry into the target scope's existing `registries` map.
- Treat same ID + same URL in the target scope as successful idempotency and report `already registered`.
- Treat same ID + different URL in the target scope as a conflict unless `-f, --force` is supplied.
- Persist an entry even when it matches a default-registry entry, creating an explicit reproducibility pin.
- Keep the operation offline and store-first: write config only.
- Refuse to overwrite a present but malformed global config.

### Non-goals

- `remove-registry` or `list-registries` commands.
- URL validation or normalization, including GitHub-only checks, `.git` suffix handling, or `git ls-remote`.
- Cloning, refreshing, indexing, or otherwise touching `~/.ai-devkit/skills/` during registration.
- Authentication, SSH/OAuth/credential management, ref/version pinning, or atomic-write refactors.
- Migrating or rewriting existing hand-edited registry entries.

## Terminology

- **Registry ID:** The validated `owner/repository` identifier stored as a key.
- **Registry URL:** Any user-provided string stored verbatim as the value.
- **Project scope:** The current project's `.ai-devkit.json`; this is the default target.
- **Global scope:** `~/.ai-devkit/.ai-devkit.json`, selected with `--global`.
- **Pin:** An explicit project/global entry, including one identical to the default registry, that preserves the user's chosen mapping in config.

## User Stories & Use Cases

- As a project maintainer, I want to run `ai-devkit skill add-registry anthropics/skills https://github.com/anthropics/skills.git` so the project resolves that registry without hand-editing JSON.
- As a user, I want to run `ai-devkit skill add-registry example/private-skills git@example.com:example/private-skills.git --global` so all projects can resolve an SSH-hosted registry.
- As a user, I want arbitrary URL strings, including strings without `.git`, stored exactly as supplied.
- As a maintainer, I want an identical repeat invocation to succeed without rewriting config.
- As a maintainer, I want an accidental same-scope URL change rejected and an intentional change enabled by `--force`.
- As a maintainer, I want a registry matching the built-in default persisted in the selected scope as a reproducibility pin.
- As a global-config user, I want a malformed existing file protected from destructive replacement.

## Success Criteria

- The CLI exposes only `skill add-registry <id> <url>` for registry management, with `--global` and `--force` options.
- Valid IDs matching `^[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+$` are accepted; bare slugs, nested paths, and dotted segments are rejected through `validateRegistryId()`.
- Every URL argument is stored byte-for-byte as Commander supplies it; no URL-specific validation or network operation occurs.
- Project and global writes preserve unrelated config fields and existing registry entries.
- Same-scope identical entries return success without a disk write and produce an `already registered` message.
- Same-scope conflicts fail without changing config; `--force` replaces only the conflicting registry value.
- A missing global config is created, while an existing unreadable global config yields a clear error and is not overwritten.
- Existing merged-registry precedence makes the persisted entry available to downstream skill commands without changes to cache behavior.
- Unit tests use mocked filesystem boundaries, cover 100% of new pure logic, and the full repository test/lint/build suites regress cleanly.

## Constraints & Assumptions

- Existing config types already support `registries?: Record<string, string>`.
- `ConfigManager.update()` remains the project write boundary and retains its no-change optimization.
- Global mutation must distinguish missing config from parse failure even though `GlobalConfigManager.read()` intentionally returns `null` for both cases.
- Cross-layer/default-registry shadowing warnings are best-effort only; default registry availability must never gate registration. No default-registry fetch is required for the add path.
- The feature follows existing Commander command registration, terminal UI, error handling, and `-g/--global` conventions.

## Questions & Open Items

All material decisions are resolved. Deferred follow-ups are `remove-registry` and `list-registries`; they are not part of this feature.
