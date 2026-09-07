---
phase: requirements
title: Local Folder Skill Registries
description: Support canonical, read-only local folders as skill registry sources
---

# Local Folder Skill Registries

## Problem

AI DevKit treats every registry string as Git and clones/pulls it into ~/.ai-devkit/skills. Skill authors cannot consume a registry directly from a local development folder.

## Goals

- Accept absolute paths, ./..., ../..., and explicit file: URLs in skill add-registry.
- Resolve shorthand at registration and persist one canonical absolute file: URL.
- Support local roots across add, reconciliation, discovery, find/index, update, remove, status, and templates.
- Preserve Git behavior and give clear errors for missing, moved, empty, or malformed folders.

## Non-goals

- Windows drive/UNC support in phase 1.
- Watchers, local registry caches, provider hierarchies, or execution of SKILL.md.
- Automatic repair after a folder moves.

## Acceptance Criteria

- **AC-01:** Persisted file: values are unambiguously local; non-file strings retain Git semantics. Invalid file: values never fall through to Git.
- **AC-02:** CLI absolute, ./, and ../ inputs resolve against registration cwd, pass through realpath, and store pathToFileURL(realPath).href.
- **AC-03:** Template-relative paths resolve against the template directory. Manually authored project/global relative paths resolve against their config directory.
- **AC-04:** Canonical identity rejects another registry ID for the same directory. Moving a folder requires re-adding it.
- **AC-05:** Hosted file URLs, unsupported Windows paths, missing/non-directory/unusable/empty roots fail clearly.
- **AC-06:** Local preparation memoizes once per SkillRegistry instance, returns the canonical path, and stays read-only.
- **AC-07:** Add and reconciliation discover/install local skills without requiring Git.
- **AC-08:** Focused/full indexing reads local roots directly; local entries supplement seeds and refresh independently of remote TTL.
- **AC-09:** Update validates local availability and reports a live-filesystem no-op without mutation.
- **AC-10:** Removal deletes config and focused index data; global removal may clean only owned cache data and never the source.
- **AC-11:** Status identifies local registries without misclassifying or redacting them.
- **AC-12:** Installed listing never infers ../ registry IDs from symlinks outside the cache.

## Safety Rules

- **SR-01:** Never clone, pull, checkout, clean, create, copy into, write into, or delete a local registry.
- **SR-02:** Local preparation bypasses all Git operations, including Git-installation checks.
- **SR-03:** Never derive a deletion target from a local source path.
- **SR-04:** Removal may delete only an ID-derived target proven strictly beneath SKILL_CACHE_DIR.
- **SR-05:** Never fall back from an unavailable local source to a same-ID cache.
- **SR-06:** Never detect source type by filesystem existence.
- **SR-07:** Skill directories and SKILL.md must canonically remain beneath registry/skills; reject escaping symlinks.
- **SR-08:** Examine direct skills children only; never recursively search.
- **SR-09:** Bound candidate enumeration and SKILL.md reads with documented limits.
- **SR-10:** Never execute SKILL.md in registry flows.
- **SR-11:** Continue sanitizing credential-bearing Git URLs in status.
- **SR-12:** Reject malformed file: sources as local errors, never Git.

## Success Criteria

- Unit tests cover every safety rule and parser branch.
- Temp-directory adapters prove sources remain unchanged through preparation, index, update, and removal.
- CLI e2e covers normalization and errors.
- Six-project build, full tests, lint, and e2e pass.

## Constraints and Assumptions

- Registry IDs keep org/repo validation; config remains Record<string, string>.
- Installs keep symlink-first/copy-fallback after containment validation; writes target install locations only.
- Local sources are live; search re-enumerates them.
- Production limits use measured evidence; tests use injectable low limits.

## Questions

All phase-1 choices are resolved by the approved design of record. Windows/UNC, watchers/fingerprints, and structured config are deferred.
